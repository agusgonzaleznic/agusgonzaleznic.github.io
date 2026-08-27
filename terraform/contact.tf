################################################################################
# Contact form backend: Cloudflare Turnstile widget + server-side Lambda.
#
# Flow: browser -> same-origin POST /api/contact -> CloudFront ordered behavior
# -> Lambda Function URL (private, AWS_IAM + OAC/SigV4) -> 10 server-side
# controls -> the Lambda sends the owner-notification itself via SESv2.
#
# The Turnstile SECRET is a SecureString SSM param MANAGED HERE by Terraform
# (value from the Cloudflare widget resource). This differs from webhook.tf's
# params, whose values are human-managed and only referenced by name, hence
# the deploy role has scoped ssm:PutParameter on
# /agusgonzaleznic-site/contact/* (bootstrap/role-policies.tf).
#
# Mail identity + Easy-DKIM records live in ses.tf. There is no longer any
# hand-fed value in this path: the Apps Script URL and its shared secret are
# gone, along with the drift they invited.
# data.aws_caller_identity.current and data.aws_kms_alias.ssm come from webhook.tf.
################################################################################

locals {
  contact_function_name = "agusgonzaleznic-contact"
  contact_table_name    = "agusgonzaleznic-contact"

  contact_ssm_params = {
    turnstile_secret = "/agusgonzaleznic-site/contact/turnstile-secret"
  }

  # Derived, not variables: nothing here should need hand-feeding. The From
  # address is pinned in the boundary's ses:FromAddress condition
  # (bootstrap/role-policies.tf). Change both together or sends are denied.
  contact_mail_from      = "noreply@${local.domain_name}"
  contact_mail_from_name = "agusgonzaleznic.com contact form"
  contact_mail_to        = "me@${local.domain_name}"
}

################################################################################
# Cloudflare Turnstile widget
################################################################################

resource "cloudflare_turnstile_widget" "contact" {
  account_id = var.cloudflare_account_id
  name       = "${local.domain_name} contact form"
  domains    = [local.domain_name, "www.${local.domain_name}"]
  mode       = "managed"
}

################################################################################
# Secrets in SSM (SecureString; AWS-managed aws/ssm key). Values are sensitive
# TF state, which lives in the private encrypted state bucket.
################################################################################

resource "aws_ssm_parameter" "contact_turnstile_secret" {
  name  = local.contact_ssm_params.turnstile_secret
  type  = "SecureString"
  value = cloudflare_turnstile_widget.contact.secret
  tags  = local.tags
}

################################################################################
# DynamoDB: rate limits, dedupe, and Turnstile token replay guard.
# Single table, control-prefixed `pk`, numeric TTL (`expires_at`) so rows
# self-expire. On-demand billing: no capacity to manage or over-provision.
################################################################################

resource "aws_dynamodb_table" "contact" {
  name         = local.contact_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"

  attribute {
    name = "pk"
    type = "S"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  tags = local.tags
}

################################################################################
# IAM: exec role (boundary-bound, mirrors webhook.tf) + least-privilege inline
################################################################################

data "aws_iam_policy_document" "contact_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "contact" {
  name               = "agusgonzaleznic-contact-role"
  assume_role_policy = data.aws_iam_policy_document.contact_assume.json

  # REQUIRED: CI may only create agusgonzaleznic-* roles that carry this
  # boundary (anti-privilege-escalation; bootstrap/role-policies.tf). The
  # boundary is the CEILING: it must also allow the DynamoDB actions below
  # and the /agusgonzaleznic-site/* SSM read, or they are silently denied.
  permissions_boundary = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/agusgonzaleznic-lambda-exec-boundary"

  tags = local.tags
}

resource "aws_iam_role_policy_attachment" "contact_logs" {
  role       = aws_iam_role.contact.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "contact" {
  statement {
    sid       = "ReadContactParams"
    actions   = ["ssm:GetParameter"]
    resources = [aws_ssm_parameter.contact_turnstile_secret.arn]
  }

  # SecureStrings use the AWS-managed aws/ssm key; decrypt only via SSM.
  statement {
    sid       = "DecryptViaSsm"
    actions   = ["kms:Decrypt"]
    resources = [data.aws_kms_alias.ssm.target_key_arn]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.${var.aws_region}.amazonaws.com"]
    }
  }

  # Pure key access to the one table (no Scan/Query/*).
  statement {
    sid = "ContactStateTable"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
    ]
    resources = [aws_dynamodb_table.contact.arn]
  }

  # Send ONLY as the one pinned From address, ONLY via the one identity. The
  # boundary carries the identical condition; both must allow it (intersection).
  statement {
    sid     = "SendContactEmail"
    actions = ["ses:SendEmail"]
    # BOTH resource types. ses:SendEmail authorises against the identity AND, when
    # the request names one, the configuration set, so granting only the identity
    # makes every send fail AccessDenied. Effective permissions are the
    # INTERSECTION with the lambda-exec boundary, which was widened the same way
    # in the bootstrap tier first; widening one side alone changes nothing.
    resources = [
      aws_sesv2_email_identity.main.arn,
      aws_sesv2_configuration_set.contact.arn,
    ]

    condition {
      test     = "StringEquals"
      variable = "ses:FromAddress"
      values   = [local.contact_mail_from]
    }
  }
}

resource "aws_iam_role_policy" "contact" {
  name   = "contact-runtime"
  role   = aws_iam_role.contact.id
  policy = data.aws_iam_policy_document.contact.json
}

################################################################################
# Lambda (nodejs22.x / arm64). Source owned by lambda-src/contact/ (another
# agent). archive_file is read at plan time, not validate, so an empty source
# dir does not break `terraform validate`.
################################################################################

data "archive_file" "contact" {
  type        = "zip"
  source_dir  = "${path.module}/contact-lambda-src"
  output_path = "${path.module}/.terraform/contact.zip"
  # Ship only the handler; the unit test never runs in Lambda.
  excludes = ["index.test.mjs"]
}

resource "aws_lambda_function" "contact" {
  function_name = local.contact_function_name
  role          = aws_iam_role.contact.arn
  runtime       = "nodejs22.x"
  handler       = "index.handler"
  architectures = ["arm64"]

  # Lambda allocates CPU in proportion to memory, so this is a LATENCY setting
  # here, not a footprint one. At 128 MB a real submission took 9.6 s of a 10 s
  # timeout (measured: 08-23 06:18, Max Memory Used 108 MB) because the three
  # AWS SDK clients are imported inside the handler and their load + TLS
  # handshakes ran on ~1/12th of a vCPU. A 9.6 s in-flight POST is a long window
  # for a browser to lose the response, and a lost response is reported to the
  # visitor as "failed to send" for mail SES had already accepted.
  #
  # 512 MB is ~4x the CPU at roughly neutral cost (billed duration falls about
  # as much as the per-ms rate rises). It also restores headroom: 108-113 MB
  # observed against a 128 MB cap left ~12%, and an OOM kill produces no usable
  # error. Do not lower without re-measuring the delivered-path duration.
  memory_size = 512
  timeout     = 10

  filename         = data.archive_file.contact.output_path
  source_code_hash = data.archive_file.contact.output_base64sha256

  # No reserved_concurrent_executions: account concurrency limit is 10 and
  # reserving requires keeping >=100 unreserved (see webhook.tf). Abuse is
  # bounded by the in-handler rate limits + 10s timeout.

  # Env contract is defined by contact-lambda-src/index.mjs; keep names in sync.
  environment {
    variables = {
      DDB_TABLE              = aws_dynamodb_table.contact.name
      TURNSTILE_SECRET_PARAM = local.contact_ssm_params.turnstile_secret
      MAIL_FROM              = local.contact_mail_from
      MAIL_FROM_NAME         = local.contact_mail_from_name
      MAIL_TO                = local.contact_mail_to
      TURNSTILE_ACTION       = "contact"
      ALLOWED_HOSTNAMES      = "${local.domain_name},www.${local.domain_name}"
      ALLOWED_ORIGINS        = "https://${local.domain_name},https://www.${local.domain_name}"
      # Naming the set is what routes bounces and complaints to the CloudWatch
      # metrics the alarms watch. Referencing the resource (not a string literal)
      # also gives Terraform the dependency edge, so the set exists before the
      # function that names it. The handler treats an unset value as "no
      # configuration set" and still sends, so a rollback here degrades rather
      # than breaks.
      SES_CONFIGURATION_SET = aws_sesv2_configuration_set.contact.configuration_set_name
    }
  }

  tags = local.tags

  depends_on = [aws_iam_role_policy_attachment.contact_logs]
}

# AWS_IAM (not NONE): the URL is invocable only by a SigV4-signing caller:
# here, CloudFront via the OAC below. Public direct hits get 403.
resource "aws_lambda_function_url" "contact" {
  function_name      = aws_lambda_function.contact.function_name
  authorization_type = "AWS_IAM"
}

# Origin Access Control for a Lambda origin: CloudFront SigV4-signs every
# origin request so the AWS_IAM Function URL accepts it.
resource "aws_cloudfront_origin_access_control" "contact" {
  name                              = "${local.contact_function_name}-oac"
  description                       = "SigV4 OAC: contact Function URL is reachable only via CloudFront"
  origin_access_control_origin_type = "lambda"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# The ONLY invoke grant on the URL: the CloudFront service principal, pinned to
# this distribution. Ref: AWS "restricting access to a Lambda function URL"
# (CloudFront OAC for Lambda). module.cloudfront is defined in cdn.tf.
resource "aws_lambda_permission" "contact_cloudfront" {
  statement_id           = "AllowCloudFrontInvokeUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.contact.function_name
  principal              = "cloudfront.amazonaws.com"
  source_arn             = module.cloudfront.cloudfront_distribution_arn
  function_url_auth_type = "AWS_IAM"
}

# Since October 2025, invoking a Function URL ALSO requires lambda:InvokeFunction
# (not just lambda:InvokeFunctionUrl), or CloudFront gets 403 AccessDenied before
# the request reaches the handler. Unlike webhook.tf (auth NONE, needs a Bool
# condition the provider can't express, hence CLI-managed), this URL is AWS_IAM
# via OAC and the plain statement below is expressible in TF. See the AWS
# "restricting access to a Lambda function URL" doc, which shows BOTH grants.
resource "aws_lambda_permission" "contact_cloudfront_invoke" {
  statement_id  = "AllowCloudFrontInvokeFunction"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.contact.function_name
  principal     = "cloudfront.amazonaws.com"
  source_arn    = module.cloudfront.cloudfront_distribution_arn
}
