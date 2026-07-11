################################################################################
# Contact form backend: Cloudflare Turnstile widget + server-side Lambda.
#
# Flow: browser -> same-origin POST /api/contact -> CloudFront ordered behavior
# -> Lambda Function URL (private, AWS_IAM + OAC/SigV4) -> 10 server-side
# controls -> forwards the sanitized payload to the Google Apps Script.
#
# The Turnstile SECRET and the Apps Script URL are SecureString SSM params
# MANAGED HERE by Terraform (values from the Cloudflare widget resource and
# var.apps_script_url). This differs from webhook.tf's params, whose values are
# human-managed and only referenced by name — hence the deploy role has scoped
# ssm:PutParameter on /agusgonzaleznic-site/contact/* (bootstrap/role-policies.tf).
# data.aws_caller_identity.current and data.aws_kms_alias.ssm come from webhook.tf.
################################################################################

locals {
  contact_function_name = "agusgonzaleznic-contact"
  contact_table_name    = "agusgonzaleznic-contact"

  contact_ssm_params = {
    turnstile_secret   = "/agusgonzaleznic-site/contact/turnstile-secret"
    apps_script_url    = "/agusgonzaleznic-site/contact/apps-script-url"
    apps_script_secret = "/agusgonzaleznic-site/contact/apps-script-secret"
  }
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

resource "aws_ssm_parameter" "contact_apps_script_url" {
  name  = local.contact_ssm_params.apps_script_url
  type  = "SecureString"
  value = var.apps_script_url
  tags  = local.tags
}

# Server-only shared secret injected into the forward payload. The Apps Script
# doPost() must reject any POST whose `secret` field does not match this value
# (the /exec URL itself is not secret — it once shipped in the client bundle).
# Rotate this together with the Apps Script deployment; see README runbook.
resource "aws_ssm_parameter" "contact_apps_script_secret" {
  name  = local.contact_ssm_params.apps_script_secret
  type  = "SecureString"
  value = var.apps_script_shared_secret
  tags  = local.tags
}

################################################################################
# DynamoDB — rate limits, dedupe, and Turnstile token replay guard.
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
# IAM — exec role (boundary-bound, mirrors webhook.tf) + least-privilege inline
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
  # boundary is the CEILING — it must also allow the DynamoDB actions below
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
    sid     = "ReadContactParams"
    actions = ["ssm:GetParameter"]
    resources = [
      aws_ssm_parameter.contact_turnstile_secret.arn,
      aws_ssm_parameter.contact_apps_script_url.arn,
      aws_ssm_parameter.contact_apps_script_secret.arn,
    ]
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
  memory_size   = 128
  timeout       = 10

  filename         = data.archive_file.contact.output_path
  source_code_hash = data.archive_file.contact.output_base64sha256

  # No reserved_concurrent_executions: account concurrency limit is 10 and
  # reserving requires keeping >=100 unreserved (see webhook.tf). Abuse is
  # bounded by the in-handler rate limits + 10s timeout.

  # Env contract is defined by contact-lambda-src/index.mjs — keep names in sync.
  environment {
    variables = {
      DDB_TABLE                = aws_dynamodb_table.contact.name
      TURNSTILE_SECRET_PARAM   = local.contact_ssm_params.turnstile_secret
      APPS_SCRIPT_URL_PARAM    = local.contact_ssm_params.apps_script_url
      APPS_SCRIPT_SECRET_PARAM = local.contact_ssm_params.apps_script_secret
      TURNSTILE_ACTION         = "contact"
      ALLOWED_HOSTNAMES        = "${local.domain_name},www.${local.domain_name}"
      ALLOWED_ORIGINS          = "https://${local.domain_name},https://www.${local.domain_name}"
    }
  }

  tags = local.tags

  depends_on = [aws_iam_role_policy_attachment.contact_logs]
}

# AWS_IAM (not NONE): the URL is invocable only by a SigV4-signing caller —
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
