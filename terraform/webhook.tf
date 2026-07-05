################################################################################
# Storyblok -> GitHub Actions rebuild webhook (Lambda + Function URL)
#
# SecureString parameter VALUES are created/rotated outside Terraform and are
# only referenced by name here — never data-read into state.
################################################################################

locals {
  webhook_function_name = "agusgonzaleznic-storyblok-rebuild"
  webhook_github_repo   = "agusgonzaleznic/agusgonzaleznic.github.io"
  webhook_workflow_file = "deploy.yml"

  webhook_ssm_params = {
    url_token  = "/agusgonzaleznic-site/webhook/url-token"
    github_pat = "/agusgonzaleznic-site/webhook/github-pat"
  }
}

data "aws_caller_identity" "current" {}

data "aws_kms_alias" "ssm" {
  name = "alias/aws/ssm"
}

################################################################################
# IAM
################################################################################

data "aws_iam_policy_document" "webhook_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "webhook" {
  name               = "agusgonzaleznic-storyblok-rebuild-role"
  assume_role_policy = data.aws_iam_policy_document.webhook_assume.json

  # REQUIRED: the CI deploy role may only iam:CreateRole/PutRolePolicy on
  # roles carrying this boundary (anti-privilege-escalation; defined in
  # bootstrap/role-policies.tf — the policy NAME is the cross-module
  # contract). Removing this makes the CI apply fail with AccessDenied.
  permissions_boundary = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/agusgonzaleznic-lambda-exec-boundary"

  tags = local.tags
}

resource "aws_iam_role_policy_attachment" "webhook_logs" {
  role       = aws_iam_role.webhook.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "webhook_ssm" {
  statement {
    sid     = "ReadWebhookParams"
    actions = ["ssm:GetParameter"]
    resources = [
      for name in values(local.webhook_ssm_params) :
      "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${name}"
    ]
  }

  # SecureStrings use the AWS-managed aws/ssm key; decrypt is only allowed
  # when the call is made through SSM in this region.
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
}

resource "aws_iam_role_policy" "webhook_ssm" {
  name   = "webhook-ssm-read"
  role   = aws_iam_role.webhook.id
  policy = data.aws_iam_policy_document.webhook_ssm.json
}

################################################################################
# Lambda
################################################################################

data "archive_file" "webhook" {
  type        = "zip"
  source_dir  = "${path.module}/lambda-src/storyblok-rebuild"
  output_path = "${path.module}/.terraform/storyblok-rebuild.zip"
}

resource "aws_lambda_function" "webhook" {
  function_name = local.webhook_function_name
  role          = aws_iam_role.webhook.arn
  runtime       = "nodejs22.x"
  handler       = "index.handler"
  architectures = ["arm64"]
  memory_size   = 128
  timeout       = 10

  filename         = data.archive_file.webhook.output_path
  source_code_hash = data.archive_file.webhook.output_base64sha256

  # NO reserved_concurrent_executions: this account's concurrency limit is 10
  # (verified via get-account-settings 2026-07-05) and reserving any requires
  # keeping >=100 unreserved, so PutFunctionConcurrency would fail on apply.
  # Abuse is bounded by the ?token gate and the 10s timeout instead.

  environment {
    variables = {
      GITHUB_REPO          = local.webhook_github_repo
      WORKFLOW_FILE        = local.webhook_workflow_file
      SSM_URL_TOKEN_PARAM  = local.webhook_ssm_params.url_token
      SSM_GITHUB_PAT_PARAM = local.webhook_ssm_params.github_pat
    }
  }

  tags = local.tags

  depends_on = [aws_iam_role_policy_attachment.webhook_logs]
}

resource "aws_lambda_function_url" "webhook" {
  function_name      = aws_lambda_function.webhook.function_name
  authorization_type = "NONE"
}

# auth NONE still requires an explicit public-invoke resource policy.
resource "aws_lambda_permission" "webhook_url" {
  statement_id           = "AllowPublicFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.webhook.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

# Since October 2025, function URLs ALSO require lambda:InvokeFunction with
# the Bool condition lambda:InvokedViaFunctionUrl=true, or every URL request
# gets 403 AccessDeniedException before reaching the handler. Provider 5.100.0
# has no invoked_via_function_url argument on aws_lambda_permission, so that
# statement is CLI-managed (invisible to TF's per-statement tracking — plans
# stay clean). Fold into TF when the aws provider is bumped past 6.x:
#   aws lambda add-permission --function-name agusgonzaleznic-storyblok-rebuild \
#     --statement-id UrlPolicyInvokeFunction --action lambda:InvokeFunction \
#     --principal "*" --invoked-via-function-url --region us-east-1
# (applied 2026-07-05; delete/recreate of the function requires re-running it)
