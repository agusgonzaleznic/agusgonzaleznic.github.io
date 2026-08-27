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
  ses_identity_arn            = "arn:aws:ses:us-east-1:${local.account_id}:identity/agusgonzaleznic.com"
  # Configuration set the contact Lambda sends through, created by the site
  # module. Named here because the boundary has to allow SendEmail on it before
  # anything can use it, and IAM happily references an ARN that does not exist
  # yet — which is what makes the bootstrap-first ordering possible at all.
  ses_config_set_arn    = "arn:aws:ses:us-east-1:${local.account_id}:configuration-set/agusgonzaleznic-contact"
  acm_certificate_arn   = "arn:aws:acm:us-east-1:${local.account_id}:certificate/5252733a-e6e7-4161-bf9e-83b791bb885a"
  lambda_function_arns  = ["arn:aws:lambda:us-east-1:${local.account_id}:function:agusgonzaleznic-*"]
  lambda_exec_role_arns = ["arn:aws:iam::${local.account_id}:role/agusgonzaleznic-*"]
  dynamodb_table_arns = [
    "arn:aws:dynamodb:us-east-1:${local.account_id}:table/agusgonzaleznic-*",
    "arn:aws:dynamodb:us-east-1:${local.account_id}:table/agusgonzaleznic-*/index/*",
  ]
  # The relay's dead-letter queue. Prefixed like every other ceiling here so a
  # second queue needs no IAM change.
  sqs_queue_arns = ["arn:aws:sqs:us-east-1:${local.account_id}:agusgonzaleznic-*"]
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

# --- Terraform state (site/ prefix only; bootstrap/ state belongs to the ----
# --- bootstrap roles in role-bootstrap-ci.tf, never to the deploy role)  ----

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

  # Response-headers-policy lifecycle (the immutable_assets policy for the
  # /assets/* + /fonts/* long-cache behaviors). Create*/Delete* can't be scoped
  # to a specific policy ID — it doesn't exist until CI creates it — so
  # response-headers-policy/* is unavoidable, the same single-tenant tradeoff as
  # CloudFrontManageApiPolicies below. Get/Update of the pre-existing
  # security_headers policy stay ARN-scoped in ManageSiteDistribution.
  statement {
    sid    = "CloudFrontManageResponseHeadersPolicies"
    effect = "Allow"
    actions = [
      "cloudfront:CreateResponseHeadersPolicy",
      "cloudfront:DeleteResponseHeadersPolicy",
      "cloudfront:GetResponseHeadersPolicy",
      "cloudfront:GetResponseHeadersPolicyConfig",
      "cloudfront:UpdateResponseHeadersPolicy",
    ]
    resources = ["arn:aws:cloudfront::${local.account_id}:response-headers-policy/*"]
  }

  # Cache-policy lifecycle. The site defines its own cache policy so /assets/*
  # and /fonts/* are pinned at the EDGE for a year: the managed
  # CachingOptimized policy honours the origin's Cache-Control, and the origin
  # is GitHub Pages sending max-age=600, so without this the edge expired those
  # paths every 10 minutes while telling browsers a year.
  #
  # Mirrors CloudFrontManageResponseHeadersPolicies above, including its
  # tradeoff: Create cannot be scoped to a policy ID that does not exist yet, so
  # cache-policy/* is unavoidable. That is the ARN CloudFront itself authorises
  # CreateCachePolicy against.
  #
  # Read-only GetCachePolicy/ListCachePolicies already live in
  # CloudFrontUnscopedReads below, because the MANAGED-policy data sources need
  # them; those are unscoped and stay there.
  statement {
    sid    = "CloudFrontManageCachePolicies"
    effect = "Allow"
    actions = [
      "cloudfront:CreateCachePolicy",
      "cloudfront:DeleteCachePolicy",
      "cloudfront:GetCachePolicy",
      "cloudfront:GetCachePolicyConfig",
      "cloudfront:UpdateCachePolicy",
    ]
    resources = ["arn:aws:cloudfront::${local.account_id}:cache-policy/*"]
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

  # OAC + origin-request-policy management for the contact /api behavior.
  # Create* actions don't accept resource ARNs, and the OAC/policy IDs don't
  # exist until CI creates them, so Resource:* is unavoidable (single-tenant
  # account; same documented tradeoff as the List* reads above). Deliberately
  # NO distribution/*Config actions — those stay pinned to the site
  # distribution ARN in ManageSiteDistribution.
  statement {
    sid    = "CloudFrontManageApiPolicies"
    effect = "Allow"
    actions = [
      "cloudfront:CreateOriginAccessControl",
      "cloudfront:GetOriginAccessControl",
      "cloudfront:GetOriginAccessControlConfig",
      "cloudfront:UpdateOriginAccessControl",
      "cloudfront:DeleteOriginAccessControl",
      "cloudfront:ListOriginAccessControls",
      "cloudfront:CreateOriginRequestPolicy",
      "cloudfront:GetOriginRequestPolicy",
      "cloudfront:GetOriginRequestPolicyConfig",
      "cloudfront:UpdateOriginRequestPolicy",
      "cloudfront:DeleteOriginRequestPolicy",
      "cloudfront:ListOriginRequestPolicies",
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
      "logs:PutRetentionPolicy",
      "logs:TagResource",
      "logs:UntagResource",
      "logs:ListTagsForResource",
    ]
    resources = local.lambda_log_group_arns
    # logs:DescribeLogGroups is deliberately NOT here — see ReadLogGroups in the
    # observability policy below. It was listed here for a long time and never
    # worked, because it is a LIST operation: IAM evaluates it against
    # `log-group::log-stream:` (an empty resource), so an ARN-scoped grant never
    # matches. Nothing read a log group until the retention import block, which
    # is why the dead grant went unnoticed.
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

# --- DynamoDB (contact form state table) ------------------------------------
# Deploy-time table management only. The runtime data-plane actions
# (GetItem/PutItem/UpdateItem/DeleteItem) belong to the Lambda exec role, not
# CI — they are granted by the boundary + the exec role's inline policy.

data "aws_iam_policy_document" "dynamodb" {
  statement {
    sid    = "ManageContactTable"
    effect = "Allow"
    actions = [
      "dynamodb:CreateTable",
      "dynamodb:DeleteTable",
      "dynamodb:DescribeTable",
      "dynamodb:UpdateTable",
      "dynamodb:DescribeTimeToLive",
      "dynamodb:UpdateTimeToLive",
      "dynamodb:DescribeContinuousBackups",
      "dynamodb:ListTagsOfResource",
      "dynamodb:TagResource",
      "dynamodb:UntagResource",
    ]
    resources = local.dynamodb_table_arns
  }

  # ListTables is an account-level list and cannot be resource-scoped.
  statement {
    sid       = "ListTables"
    effect    = "Allow"
    actions   = ["dynamodb:ListTables"]
    resources = ["*"]
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

  # Ceiling for the contact Lambda's runtime table access. Data-plane only
  # (no table management); scoped to agusgonzaleznic-* tables.
  statement {
    sid    = "ContactStateTable"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
    ]
    resources = local.dynamodb_table_arns
  }

  # Ceiling for the contact Lambda sending its own notification mail. Without
  # this the site apply SUCCEEDS and the function is denied at RUNTIME, because
  # effective permissions are the INTERSECTION of role policy and boundary.
  # Scoped to the one identity AND pinned to the one From address, so an
  # injected policy cannot turn this role into an open relay for the domain.
  statement {
    sid     = "SendContactEmail"
    effect  = "Allow"
    actions = ["ses:SendEmail"]
    # ses:SendEmail authorises against TWO resource types, and a request naming a
    # configuration set is checked against both. Granting only the identity means
    # every send that passes ConfigurationSetName fails AccessDenied — and because
    # the Lambda catches everything and returns HTTP, that surfaces as a 502 on
    # every submission with AWS/Lambda Errors still reading zero.
    #
    # Both ARNs are listed here so the boundary is ready before the site module
    # creates the set. The role policy in contact.tf must be widened the same way;
    # effective permissions are the INTERSECTION, so widening only one changes
    # nothing.
    resources = [local.ses_identity_arn, local.ses_config_set_arn]

    condition {
      test     = "StringEquals"
      variable = "ses:FromAddress"
      values   = ["noreply@agusgonzaleznic.com"]
    }
  }

  # Ceiling for the relay writing a DISCARDED alert to its dead-letter queue.
  #
  # Lambda delivers to an on-failure destination using the FUNCTION'S OWN
  # execution role, not a service principal, so the boundary gates it. Without
  # this the destination is configured and every delivery into it is denied,
  # which produces a dead-letter queue that exists, reports zero messages, and
  # invites exactly the false confidence a DLQ is supposed to remove. That is a
  # worse outcome than having no DLQ at all.
  #
  # Identical intersection trap to SendContactEmail above, and the reason the DLQ
  # cannot land behind a single gate: the role policy in observability.tf and this
  # ceiling must both allow it, so the bootstrap tier goes first.
  #
  # SendMessage ONLY. Deliberately not ReceiveMessage or DeleteMessage: draining
  # the queue is a human recovery step, and a role that can delete from its own
  # dead-letter queue can erase the evidence of its own failure.
  statement {
    sid       = "WriteDiscardedAlertToDlq"
    effect    = "Allow"
    actions   = ["sqs:SendMessage"]
    resources = local.sqs_queue_arns
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

  # The contact module MANAGES this param in Terraform (value from the
  # Cloudflare widget secret), unlike the webhook params
  # which are human-managed and read-only. Write access is scoped to the
  # contact/ prefix ONLY — CI must never write the human-managed secrets
  # elsewhere under /agusgonzaleznic-site/*.
  statement {
    sid    = "ManageContactParameters"
    effect = "Allow"
    actions = [
      "ssm:PutParameter",
      "ssm:DeleteParameter",
      "ssm:AddTagsToResource",
      "ssm:RemoveTagsFromResource",
    ]
    resources = ["arn:aws:ssm:us-east-1:${local.account_id}:parameter/agusgonzaleznic-site/contact/*"]
  }

  # SecureString writes/reads for the contact params use the aws/ssm managed
  # key; scoped by the ssm ViaService condition so the grant only works through
  # SSM in this region.
  statement {
    sid       = "ContactParamsKms"
    effect    = "Allow"
    actions   = ["kms:Encrypt", "kms:Decrypt"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.us-east-1.amazonaws.com"]
    }
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

# --- SES (contact-form sender identity) -------------------------------------
# The contact Lambda sends the owner-notification itself via SESv2; the domain
# identity and its Easy-DKIM CNAMEs are managed by the site module (ses.tf).
# NOTE the IAM prefix is `ses:` for BOTH the v1 and v2 APIs - there is no
# `sesv2:` prefix. GetEmailIdentity is read on EVERY plan (the DKIM tokens are
# a resource attribute), so without it even `terraform plan` fails on a PR.

data "aws_iam_policy_document" "ses" {
  statement {
    sid    = "ManageSenderIdentity"
    effect = "Allow"
    actions = [
      "ses:CreateEmailIdentity",
      "ses:DeleteEmailIdentity",
      "ses:GetEmailIdentity",
      "ses:PutEmailIdentityDkimAttributes",
      "ses:PutEmailIdentityDkimSigningAttributes",
      "ses:PutEmailIdentityMailFromAttributes",
      "ses:TagResource",
      "ses:UntagResource",
      "ses:ListTagsForResource",
    ]
    resources = [local.ses_identity_arn]
  }

  # The configuration set and its event destination, so the site module can
  # manage them. Action names taken from the SESv2 service-authorization
  # reference, not inferred from the resource arguments that happen to be
  # written: the last two IAM gaps here were both READ actions the provider calls
  # on refresh but no config file mentions.
  #
  # Every Put*Options action is listed even though the initial resource sets only
  # some of them — the provider calls the one matching whichever field changes, so
  # a policy covering only today's fields turns any later edit into a failed apply
  # that needs a second bootstrap round trip and a second human approval.
  #
  # DELIBERATELY OMITTED: ses:ListConfigurationSets. It is the one action here
  # that cannot be ARN-scoped (resource type `*`), and the provider does not need
  # it — Create/Read/Update/Delete and import all address the set by name via
  # GetConfigurationSet. If a plan ever fails asking for it, that is the action to
  # add, with a comment saying why it has to be unscoped.
  statement {
    sid    = "ManageContactConfigurationSet"
    effect = "Allow"
    actions = [
      "ses:CreateConfigurationSet",
      "ses:DeleteConfigurationSet",
      "ses:GetConfigurationSet",
      "ses:PutConfigurationSetDeliveryOptions",
      "ses:PutConfigurationSetReputationOptions",
      "ses:PutConfigurationSetSendingOptions",
      "ses:PutConfigurationSetSuppressionOptions",
      "ses:PutConfigurationSetTrackingOptions",
      "ses:PutConfigurationSetVdmOptions",
      "ses:CreateConfigurationSetEventDestination",
      "ses:UpdateConfigurationSetEventDestination",
      "ses:DeleteConfigurationSetEventDestination",
      "ses:GetConfigurationSetEventDestinations",
      "ses:TagResource",
      "ses:UntagResource",
      "ses:ListTagsForResource",
    ]
    resources = [local.ses_config_set_arn]
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
    dynamodb     = data.aws_iam_policy_document.dynamodb.json
    ssm          = data.aws_iam_policy_document.ssm.json
    ses          = data.aws_iam_policy_document.ses.json
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

################################################################################
# Observability grants for the deploy role.
#
# WHY INLINE, NOT A TENTH MANAGED POLICY: an IAM role allows 10 attached managed
# policies by default and local.deploy_role_policies already defines NINE. A
# tenth would sit exactly on the quota, so the next service adopted would be
# blocked behind a Service Quotas request. Inline policies count against a
# separate limit (aggregate size, not count), so putting these here preserves
# the last managed slot as headroom. Same tier, same reviewer, same gate — only
# the attachment mechanism differs.
################################################################################
# WHEN ADDING A RESOURCE TYPE HERE, ENUMERATE WHAT THE PROVIDER *READS*, NOT
# JUST WHAT IT WRITES. Two grants in this policy were discovered only by a failed
# apply — logs:DescribeLogGroups (a LIST action, so it cannot be ARN-scoped) and
# budgets:ListTagsForResource (read on every refresh even with no tags declared).
# Both times the create succeeded and the follow-up read failed, which leaves the
# apply half-done. The provider's resource docs list the required IAM actions per
# resource; read those rather than inferring from the verbs you happen to use.
data "aws_iam_policy_document" "deploy_observability" {
  # SQS: the alert relay's dead-letter queue. Read the warning directly above
  # this document before editing this list.
  #
  # Enumerated from what the provider READS, not from the verbs the config
  # happens to use. Three of these are the ones a verb-based guess drops, and
  # each produces the half-done apply that warning describes:
  #   GetQueueUrl        the resource id IS the queue URL, so the provider
  #                      resolves it on create and on every refresh
  #   GetQueueAttributes read on every refresh to diff the queue's settings
  #   ListQueueTags      read on every refresh because the queue declares tags
  #
  # ListQueues is deliberately absent. It cannot be ARN-scoped, and the provider
  # never needs it: it addresses a queue by name on create and by stored URL
  # thereafter. If a future import path turns out to need it, add it as its own
  # Resource:* statement rather than widening this one.
  statement {
    sid    = "ManageAlertRelayDlq"
    effect = "Allow"
    actions = [
      "sqs:CreateQueue",
      "sqs:DeleteQueue",
      "sqs:GetQueueAttributes",
      "sqs:GetQueueUrl",
      "sqs:ListQueueTags",
      "sqs:SetQueueAttributes",
      "sqs:TagQueue",
      "sqs:UntagQueue",
    ]
    resources = local.sqs_queue_arns
  }

  # Metric filters live ON the Lambda log groups, so they reuse the same
  # resource scope as ManageFunctionLogGroups.
  statement {
    sid    = "ManageLogMetricFilters"
    effect = "Allow"
    actions = [
      "logs:PutMetricFilter",
      "logs:DeleteMetricFilter",
    ]
    resources = local.lambda_log_group_arns
  }

  # LIST operations that IAM cannot resource-scope: both are evaluated against an
  # empty resource, so anything narrower than "*" silently denies. Same class as
  # lambda:ListFunctions / route53:ListHostedZones / acm:ListCertificates
  # elsewhere in this file. Read-only, so "*" costs nothing.
  statement {
    sid    = "ReadLogGroups"
    effect = "Allow"
    actions = [
      "logs:DescribeLogGroups",
      "logs:DescribeMetricFilters",
    ]
    resources = ["*"]
  }

  # CloudWatch alarms are named, so they CAN be scoped by ARN.
  statement {
    sid    = "ManageSiteAlarms"
    effect = "Allow"
    actions = [
      "cloudwatch:PutMetricAlarm",
      "cloudwatch:DeleteAlarms",
      "cloudwatch:TagResource",
      "cloudwatch:UntagResource",
      "cloudwatch:ListTagsForResource",
    ]
    resources = ["arn:aws:cloudwatch:us-east-1:${local.account_id}:alarm:agusgonzaleznic-*"]
  }

  # DescribeAlarms cannot be resource-scoped (it is a list operation).
  statement {
    sid       = "ReadAlarms"
    effect    = "Allow"
    actions   = ["cloudwatch:DescribeAlarms"]
    resources = ["*"]
  }

  statement {
    sid    = "ManageAlertTopic"
    effect = "Allow"
    actions = [
      "sns:CreateTopic",
      "sns:DeleteTopic",
      "sns:GetTopicAttributes",
      "sns:SetTopicAttributes",
      "sns:Subscribe",
      "sns:Unsubscribe",
      "sns:ListSubscriptionsByTopic",
      "sns:ListTagsForResource",
      "sns:TagResource",
      "sns:UntagResource",
    ]
    resources = ["arn:aws:sns:us-east-1:${local.account_id}:agusgonzaleznic-*"]
  }

  # sns:GetSubscriptionAttributes takes the SUBSCRIPTION arn, whose suffix is a
  # server-generated uuid — not prefixable, hence Resource "*" on a read-only
  # action. Terraform reads it on every refresh of the subscription.
  statement {
    sid       = "ReadSubscriptions"
    effect    = "Allow"
    actions   = ["sns:GetSubscriptionAttributes"]
    resources = ["*"]
  }

  # Budgets are global (no region in the ARN) and the API is not
  # resource-scopable for Describe.
  statement {
    sid    = "ManageCostBudget"
    effect = "Allow"
    actions = [
      "budgets:ViewBudget",
      "budgets:ModifyBudget",
      # The provider READS a budget's tags on every refresh even when the
      # resource declares none, so ViewBudget+ModifyBudget alone is not enough:
      # the budget was created and then the very next tag read failed with
      # AccessDenied, breaking the apply after it had already changed things.
      # Tag/Untag are included so adding `tags` later does not need another
      # bootstrap round trip.
      "budgets:ListTagsForResource",
      "budgets:TagResource",
      "budgets:UntagResource",
    ]
    resources = ["arn:aws:budgets::${local.account_id}:budget/*"]
  }
}

resource "aws_iam_role_policy" "deploy_observability" {
  name   = "Observability"
  role   = aws_iam_role.github_terraform_deploy.id
  policy = data.aws_iam_policy_document.deploy_observability.json
}
