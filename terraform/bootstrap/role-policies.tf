# Tightly-scoped customer-managed policies for the GitHub Actions deploy role.
# Live resource IDs are hardcoded on purpose: this bootstrap module predates
# (and must not depend on) the site root module that manages those resources.

data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id

  cloudfront_distribution_arn = "arn:aws:cloudfront::${local.account_id}:distribution/E33TSNW29S4RDQ"
  cloudfront_rhp_arn          = "arn:aws:cloudfront::${local.account_id}:response-headers-policy/a21003ee-2c03-4474-b6d9-23c6fe505af7"
  cloudfront_function_arn     = "arn:aws:cloudfront::${local.account_id}:function/agusgonzaleznic-com-www-redirect"
  hosted_zone_arn             = "arn:aws:route53:::hostedzone/Z01244412JIHKLB4766PS"
  acm_certificate_arn         = "arn:aws:acm:us-east-1:${local.account_id}:certificate/5252733a-e6e7-4161-bf9e-83b791bb885a"
  lambda_function_arns        = ["arn:aws:lambda:us-east-1:${local.account_id}:function:agusgonzaleznic-*"]
  lambda_exec_role_arns       = ["arn:aws:iam::${local.account_id}:role/agusgonzaleznic-*"]
  lambda_log_group_arns = [
    "arn:aws:logs:us-east-1:${local.account_id}:log-group:/aws/lambda/agusgonzaleznic-*",
    "arn:aws:logs:us-east-1:${local.account_id}:log-group:/aws/lambda/agusgonzaleznic-*:*",
  ]
  site_bucket_arns = [
    "arn:aws:s3:::agusgonzaleznic.com",
    "arn:aws:s3:::agusgonzaleznic.com/*",
    "arn:aws:s3:::www.agusgonzaleznic.com",
    "arn:aws:s3:::www.agusgonzaleznic.com/*",
  ]
}

# --- Terraform state (site/ prefix only; bootstrap/ state is human-only) ----

data "aws_iam_policy_document" "state" {
  statement {
    sid       = "ListSiteStatePrefix"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.terraform_state.arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["site/*"]
    }
  }

  # site/* also covers the native S3 lock object site/terraform.tfstate.tflock.
  statement {
    sid       = "SiteStateObjects"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.terraform_state.arn}/site/*"]
  }

  # Defense in depth: CI must never read or write the bootstrap state
  # (it contains this role's own IAM definition).
  statement {
    sid       = "DenyBootstrapState"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = ["${aws_s3_bucket.terraform_state.arn}/bootstrap/*"]
  }
}

# --- CloudFront -------------------------------------------------------------

data "aws_iam_policy_document" "cloudfront" {
  statement {
    sid    = "ManageSiteDistribution"
    effect = "Allow"
    actions = [
      "cloudfront:GetDistribution",
      "cloudfront:GetDistributionConfig",
      "cloudfront:UpdateDistribution",
      "cloudfront:CreateInvalidation",
      "cloudfront:GetInvalidation",
      "cloudfront:ListInvalidations",
      "cloudfront:TagResource",
      "cloudfront:UntagResource",
      "cloudfront:ListTagsForResource",
      "cloudfront:GetResponseHeadersPolicy",
      "cloudfront:GetResponseHeadersPolicyConfig",
      "cloudfront:UpdateResponseHeadersPolicy",
      "cloudfront:DescribeFunction",
      "cloudfront:GetFunction",
      "cloudfront:UpdateFunction",
      "cloudfront:PublishFunction",
      "cloudfront:TestFunction",
    ]
    resources = [
      local.cloudfront_distribution_arn,
      local.cloudfront_rhp_arn,
      local.cloudfront_function_arn,
    ]
  }

  # cloudfront:List* actions and GetCachePolicy (used by the managed
  # cache-policy data source) do not support resource-level scoping;
  # Resource:* is unavoidable here and limited to read-only List/Get.
  statement {
    sid    = "CloudFrontUnscopedReads"
    effect = "Allow"
    actions = [
      "cloudfront:ListDistributions",
      "cloudfront:ListFunctions",
      "cloudfront:ListResponseHeadersPolicies",
      "cloudfront:ListCachePolicies",
      "cloudfront:GetCachePolicy",
    ]
    resources = ["*"]
  }
}

# --- Route53 ----------------------------------------------------------------

data "aws_iam_policy_document" "route53" {
  statement {
    sid    = "ManageSiteZone"
    effect = "Allow"
    actions = [
      "route53:GetHostedZone",
      "route53:ListResourceRecordSets",
      "route53:ChangeResourceRecordSets",
      "route53:ListTagsForResource",
      "route53:ChangeTagsForResource",
    ]
    resources = [local.hosted_zone_arn]
  }

  statement {
    sid       = "ReadChangeStatus"
    effect    = "Allow"
    actions   = ["route53:GetChange"]
    resources = ["arn:aws:route53:::change/*"]
  }

  # ListHostedZones* cannot be resource-scoped (account-level list).
  statement {
    sid       = "ListZones"
    effect    = "Allow"
    actions   = ["route53:ListHostedZones", "route53:ListHostedZonesByName"]
    resources = ["*"]
  }
}

# --- ACM (read + tagging of the existing cert; issuance stays human-only) ---

data "aws_iam_policy_document" "acm" {
  statement {
    sid    = "ReadAndTagSiteCert"
    effect = "Allow"
    actions = [
      "acm:DescribeCertificate",
      "acm:GetCertificate",
      "acm:ListTagsForCertificate",
      "acm:AddTagsToCertificate",
      "acm:RemoveTagsFromCertificate",
    ]
    resources = [local.acm_certificate_arn]
  }

  # ListCertificates cannot be resource-scoped.
  statement {
    sid       = "ListCerts"
    effect    = "Allow"
    actions   = ["acm:ListCertificates"]
    resources = ["*"]
  }
}

# --- Site S3 buckets --------------------------------------------------------

data "aws_iam_policy_document" "site_buckets" {
  statement {
    sid       = "ManageSiteBuckets"
    effect    = "Allow"
    actions   = ["s3:*"]
    resources = local.site_bucket_arns
  }
}

# --- Lambda + logs + lambda exec-role IAM -----------------------------------

data "aws_iam_policy_document" "lambda" {
  statement {
    sid       = "ManageSiteFunctions"
    effect    = "Allow"
    actions   = ["lambda:*"]
    resources = local.lambda_function_arns
  }

  # lambda:ListFunctions cannot be resource-scoped.
  statement {
    sid       = "ListFunctions"
    effect    = "Allow"
    actions   = ["lambda:ListFunctions"]
    resources = ["*"]
  }

  statement {
    sid    = "ManageFunctionLogGroups"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:DeleteLogGroup",
      "logs:DescribeLogGroups",
      "logs:PutRetentionPolicy",
      "logs:TagResource",
      "logs:UntagResource",
      "logs:ListTagsForResource",
    ]
    resources = local.lambda_log_group_arns
  }

  # Read / delete / detach / tag: cannot grant privilege, so no condition.
  # Deliberately excludes iam:PutRolePermissionsBoundary and
  # iam:DeleteRolePermissionsBoundary — CI must never swap or strip the
  # boundary that the two statements below depend on.
  statement {
    sid    = "ManageLambdaExecRole"
    effect = "Allow"
    actions = [
      "iam:DeleteRole",
      "iam:GetRole",
      "iam:UpdateRole",
      "iam:GetRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:ListRolePolicies",
      "iam:DetachRolePolicy",
      "iam:ListAttachedRolePolicies",
      "iam:ListInstanceProfilesForRole",
      "iam:TagRole",
      "iam:UntagRole",
    ]
    resources = local.lambda_exec_role_arns
  }

  # Privilege-escalation lockout: CI may only create roles / write inline
  # policies when the target role carries the lambda-exec permissions
  # boundary. Without this, CI could mint a fresh agusgonzaleznic-* role
  # with an inline {Action:*,Resource:*} policy, pass it to a Lambda it
  # controls, and escalate to account admin.
  statement {
    sid       = "CreateBoundedLambdaExecRole"
    effect    = "Allow"
    actions   = ["iam:CreateRole", "iam:PutRolePolicy"]
    resources = local.lambda_exec_role_arns

    condition {
      test     = "StringEquals"
      variable = "iam:PermissionsBoundary"
      values   = [aws_iam_policy.lambda_exec_boundary.arn]
    }
  }

  # Managed-policy attachment is restricted to an explicit allow-list so CI
  # cannot attach AdministratorAccess (or any other broad AWS policy) to a
  # role it can pass to Lambda. Extend the list here (human apply) if the
  # site module ever needs another managed policy.
  statement {
    sid       = "AttachAllowListedPoliciesOnly"
    effect    = "Allow"
    actions   = ["iam:AttachRolePolicy"]
    resources = local.lambda_exec_role_arns

    condition {
      test     = "ArnEquals"
      variable = "iam:PolicyARN"
      values   = ["arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"]
    }
  }

  statement {
    sid       = "PassExecRoleToLambdaOnly"
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = local.lambda_exec_role_arns

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["lambda.amazonaws.com"]
    }
  }

  # Self-modification lockout: the deploy role must never be able to alter
  # its own trust/permissions, the OIDC provider it authenticates through,
  # or the permissions boundary the CreateRole/PutRolePolicy grants hinge on.
  statement {
    sid     = "DenySelfAndOidcProviderModification"
    effect  = "Deny"
    actions = ["iam:*"]
    resources = [
      aws_iam_role.github_terraform_deploy.arn,
      module.github_oidc_provider.oidc_provider_arn,
      aws_iam_policy.lambda_exec_boundary.arn,
    ]
  }
}

# --- Permissions boundary for CI-created Lambda exec roles -------------------
# Ceiling for any role CI creates under agusgonzaleznic-*: effective
# permissions are the INTERSECTION of the role's policies and this document,
# so even an injected {Action:*,Resource:*} inline policy grants nothing
# beyond it. The site module must set `permissions_boundary` on its Lambda
# exec roles to this policy's ARN (name is the contract; see webhook.tf).

data "aws_iam_policy_document" "lambda_exec_boundary" {
  statement {
    sid    = "FunctionLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = local.lambda_log_group_arns
  }

  statement {
    sid       = "ReadSiteParameters"
    effect    = "Allow"
    actions   = ["ssm:GetParameter", "ssm:GetParameters"]
    resources = ["arn:aws:ssm:us-east-1:${local.account_id}:parameter/agusgonzaleznic-site/*"]
  }

  statement {
    sid       = "DecryptViaSsm"
    effect    = "Allow"
    actions   = ["kms:Decrypt"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.us-east-1.amazonaws.com"]
    }
  }
}

resource "aws_iam_policy" "lambda_exec_boundary" {
  name   = "agusgonzaleznic-lambda-exec-boundary"
  policy = data.aws_iam_policy_document.lambda_exec_boundary.json
}

# --- SSM Parameter Store (read-only; secret values are human-managed) -------

data "aws_iam_policy_document" "ssm" {
  statement {
    sid       = "ReadSiteParameters"
    effect    = "Allow"
    actions   = ["ssm:GetParameter", "ssm:GetParameters", "ssm:ListTagsForResource"]
    resources = ["arn:aws:ssm:us-east-1:${local.account_id}:parameter/agusgonzaleznic-site/*"]
  }

  # DescribeParameters cannot be resource-scoped (account-level list).
  statement {
    sid       = "DescribeParameters"
    effect    = "Allow"
    actions   = ["ssm:DescribeParameters"]
    resources = ["*"]
  }

  # The site module's `data "aws_kms_alias" "ssm"` (alias/aws/ssm) calls
  # kms:ListAliases + kms:DescribeKey on every plan. Both are read-only;
  # ListAliases cannot be resource-scoped, and the aws/ssm key ARN is not
  # knowable here, so Resource:* is the practical scope.
  statement {
    sid       = "ReadSsmKmsAlias"
    effect    = "Allow"
    actions   = ["kms:ListAliases", "kms:DescribeKey"]
    resources = ["*"]
  }
}

# --- Policies + attachments -------------------------------------------------

locals {
  deploy_role_policies = {
    state        = data.aws_iam_policy_document.state.json
    cloudfront   = data.aws_iam_policy_document.cloudfront.json
    route53      = data.aws_iam_policy_document.route53.json
    acm          = data.aws_iam_policy_document.acm.json
    site-buckets = data.aws_iam_policy_document.site_buckets.json
    lambda       = data.aws_iam_policy_document.lambda.json
    ssm          = data.aws_iam_policy_document.ssm.json
  }
}

resource "aws_iam_policy" "deploy" {
  for_each = local.deploy_role_policies

  name   = "github-terraform-deploy-${each.key}"
  policy = each.value
}

resource "aws_iam_role_policy_attachment" "deploy" {
  for_each = aws_iam_policy.deploy

  role       = aws_iam_role.github_terraform_deploy.name
  policy_arn = each.value.arn
}
