################################################################################
# The bootstrap tier, run from CI instead of from a human laptop.
#
# WHY THIS EXISTS
#
# Adopting a new AWS service used to need TWO applies in two places: a human
# `AWS_PROFILE=root-admin terraform apply` here to widen the deploy role, then
# the normal gated CI apply of the site module. The local trip was the part
# that hurt: out of band, on a different commit, with no plan in any log.
#
# WHAT WAS CONSIDERED AND REJECTED
#
# The tempting fix is to let the SITE deploy role manage its own policies under
# a permissions boundary. A boundary really does constrain iam: actions, so the
# mechanism is sound — but the design is not:
#
#   * Union-of-allows. Controls expressed as CONDITIONS inside identity
#     policies (e.g. iam:PermissionsBoundary on CreateRole) stop meaning
#     anything once the principal can write its own identity policies: it adds
#     one unconditioned inline statement and mints an unbounded admin role.
#   * A Deny in an ATTACHABLE managed policy is decorative to a principal
#     holding DetachRolePolicy or CreatePolicyVersion.
#   * It would not even buy one apply. data.aws_cloudfront_cache_policy,
#     data.aws_kms_alias and data.aws_caller_identity are read at PLAN time,
#     before any apply step in the same run, so a grant applied later in that
#     run cannot satisfy them.
#
# So one `terraform apply` that both grants a permission and consumes it is
# unreliable by construction. The achievable target — and the one implemented
# here — is ONE PR, ONE workflow run, ZERO local commands: this module now has
# its own OIDC roles and its own gated GitHub environment, and the workflow
# chains bootstrap-apply ahead of the site apply.
#
# HONESTY ABOUT WHAT THIS TIER IS
#
# github-terraform-bootstrap is ADMIN-EQUIVALENT and cannot be made otherwise:
# it is the tier that decides who may do what, so anything able to edit it can
# grant itself more. The real control is not an IAM scope — it is the
# `terraform-bootstrap` GitHub environment's required reviewer plus the fact
# that changes arrive only as a reviewed PR merged to main. Compared with the
# status quo it is a NARROWING, because the previous mechanism was a human
# wielding full root-admin SSO credentials with no plan recorded anywhere.
#
# The ceiling below therefore does not pretend to contain a compromised
# approved run. It blocks the persistence and lateral-movement paths this
# module never legitimately needs, so a mistake or a hijacked run cannot leave
# a durable foothold behind.
################################################################################

locals {
  # Built from a literal, not from the aws_iam_policy resource below, because
  # the ceiling's own document has to name the ceiling's ARN (self-reference).
  bootstrap_ceiling_arn = "arn:aws:iam::${local.account_id}:policy/agusgonzaleznic-bootstrap-ceiling"
  bootstrap_role_arn    = "arn:aws:iam::${local.account_id}:role/github-terraform-bootstrap"
}

################################################################################
# Permissions boundary for the write role.
#
# Deliberately shaped Allow-* + targeted Deny, NOT an enumerated allow-list.
# An enumerated ceiling on the one role CI depends on is a single point of
# failure: omit one action and every bootstrap plan and apply dies at once,
# repairable only by the human break-glass path. This module touches just IAM
# and one S3 bucket, so there is no per-service surface worth enumerating and
# nothing to gain from the risk.
################################################################################
data "aws_iam_policy_document" "bootstrap_ceiling" {
  statement {
    sid       = "BaselineAllow"
    effect    = "Allow"
    actions   = ["*"]
    resources = ["*"]
  }

  # AWS SSO permission sets and the Organizations cross-account role are the
  # account's real administrative identities. This module never manages them,
  # so denying them costs nothing and removes the most direct backdoor.
  statement {
    sid     = "DenyTouchingSsoAndOrgAdminRoles"
    effect  = "Deny"
    actions = ["iam:*"]
    resources = [
      "arn:aws:iam::${local.account_id}:role/aws-reserved/sso.amazonaws.com/*",
      "arn:aws:iam::${local.account_id}:role/OrganizationAccountAccessRole",
    ]
  }

  # This account has no IAM users and does not need any. Long-lived access keys
  # and console logins are the classic way an automated run leaves a foothold
  # that survives revoking the role.
  statement {
    sid    = "DenyIamUsersAndLongLivedCredentials"
    effect = "Deny"
    actions = [
      "iam:CreateUser",
      "iam:CreateAccessKey",
      "iam:UpdateAccessKey",
      "iam:CreateLoginProfile",
      "iam:UpdateLoginProfile",
      "iam:CreateServiceSpecificCredential",
      "iam:UploadSSHPublicKey",
      "iam:DeactivateMFADevice",
      "iam:DeleteVirtualMFADevice",
    ]
    resources = ["*"]
  }

  # Makes the ceiling non-removable by the principal it constrains. Without
  # these two, a boundary is advice rather than a limit.
  statement {
    sid    = "DenyShedingOwnCeiling"
    effect = "Deny"
    actions = [
      "iam:PutRolePermissionsBoundary",
      "iam:DeleteRolePermissionsBoundary",
    ]
    resources = [local.bootstrap_role_arn]
  }

  statement {
    sid    = "DenyRewritingOwnCeiling"
    effect = "Deny"
    actions = [
      "iam:CreatePolicyVersion",
      "iam:SetDefaultPolicyVersion",
      "iam:DeletePolicyVersion",
      "iam:DeletePolicy",
    ]
    resources = [local.bootstrap_ceiling_arn]
  }

  # prevent_destroy on the bucket is an HCL guard, invisible to IAM. This is
  # the IAM half of the same intent.
  statement {
    sid       = "DenyDeletingStateBucket"
    effect    = "Deny"
    actions   = ["s3:DeleteBucket"]
    resources = [aws_s3_bucket.terraform_state.arn]
  }
}

resource "aws_iam_policy" "bootstrap_ceiling" {
  name        = "agusgonzaleznic-bootstrap-ceiling"
  description = "Permissions boundary for github-terraform-bootstrap. Allow-* minus persistence and self-modification paths."
  policy      = data.aws_iam_policy_document.bootstrap_ceiling.json
}

################################################################################
# Write role — assumable ONLY from the gated terraform-bootstrap environment.
################################################################################
data "aws_iam_policy_document" "bootstrap_write_trust" {
  statement {
    sid     = "GitHubActionsAssume"
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [module.github_oidc_provider.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # ONLY the environment subject. Declaring `environment:` in a job REPLACES
    # the ref form in the sub claim, so this cannot be assumed by a PR job, by
    # deploy.yml, or by any other main-branch job holding id-token:write.
    # There is deliberately no pull_request and no ref:refs/heads/main entry.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_org}/${var.github_repo}:environment:${var.github_bootstrap_environment}"]
    }
  }
}

resource "aws_iam_role" "bootstrap_write" {
  name                 = "github-terraform-bootstrap"
  description          = "Assumed by GitHub Actions from the gated ${var.github_bootstrap_environment} environment to apply terraform/bootstrap. Admin-equivalent by construction; contained by its permissions boundary and gated by a required reviewer."
  assume_role_policy   = data.aws_iam_policy_document.bootstrap_write_trust.json
  permissions_boundary = aws_iam_policy.bootstrap_ceiling.arn
  max_session_duration = 3600
}

# IAMFullAccess rather than a hand-written IAM allow-list, for the same reason
# the ceiling is deny-shaped: the effective limit is the boundary, and an
# enumerated allow-list here would add silent-break risk without adding any
# containment the boundary does not already provide.
resource "aws_iam_role_policy_attachment" "bootstrap_write_iam" {
  role       = aws_iam_role.bootstrap_write.name
  policy_arn = "arn:aws:iam::aws:policy/IAMFullAccess"
}

# The state bucket is BOTH this module's backend and one of its resources, so
# object access and bucket-configuration access are both required.
# s3:DeleteObject is not optional: use_lockfile = true means an unclearable
# .tflock blocks every later run at lock acquisition.
data "aws_iam_policy_document" "bootstrap_state_access" {
  statement {
    sid    = "ManageStateBucketConfiguration"
    effect = "Allow"
    actions = [
      "s3:GetBucket*",
      "s3:PutBucket*",
      "s3:GetEncryptionConfiguration",
      "s3:PutEncryptionConfiguration",
      "s3:GetLifecycleConfiguration",
      "s3:PutLifecycleConfiguration",
      "s3:GetAccelerateConfiguration",
      "s3:ListBucket",
      "s3:ListBucketVersions",
      "s3:CreateBucket",
    ]
    resources = [aws_s3_bucket.terraform_state.arn]
  }

  statement {
    sid    = "ReadWriteOwnStateKey"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:PutObject",
      "s3:DeleteObject",
    ]
    resources = ["${aws_s3_bucket.terraform_state.arn}/bootstrap/*"]
  }
}

resource "aws_iam_role_policy" "bootstrap_write_state" {
  name   = "BootstrapStateAccess"
  role   = aws_iam_role.bootstrap_write.id
  policy = data.aws_iam_policy_document.bootstrap_state_access.json
}

################################################################################
# Plan role — read-only, and the ONLY bootstrap role a PR job can assume.
#
# Split from the write role on purpose: a PR plan runs code from a branch, and
# it must never hold iam: write. The main-branch change-detection plan uses
# this role too, which is why ref:refs/heads/main appears here and pointedly
# does not appear on any write-capable role.
################################################################################
data "aws_iam_policy_document" "bootstrap_plan_trust" {
  statement {
    sid     = "GitHubActionsAssume"
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [module.github_oidc_provider.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_org}/${var.github_repo}:pull_request",
        "repo:${var.github_org}/${var.github_repo}:ref:refs/heads/main",
      ]
    }
  }
}

resource "aws_iam_role" "bootstrap_plan" {
  name                 = "github-terraform-bootstrap-plan"
  description          = "Read-only role for `terraform plan` of terraform/bootstrap from PRs and from main-branch change detection. Holds no write permission of any kind."
  assume_role_policy   = data.aws_iam_policy_document.bootstrap_plan_trust.json
  max_session_duration = 3600
}

resource "aws_iam_role_policy_attachment" "bootstrap_plan_iam_readonly" {
  role       = aws_iam_role.bootstrap_plan.name
  policy_arn = "arn:aws:iam::aws:policy/IAMReadOnlyAccess"
}

# Read-only state access. The plan jobs run `-lock=false` precisely so this
# role needs no PutObject for the lock file.
data "aws_iam_policy_document" "bootstrap_state_read" {
  statement {
    sid    = "ReadStateBucketConfiguration"
    effect = "Allow"
    actions = [
      "s3:GetBucket*",
      "s3:GetEncryptionConfiguration",
      "s3:GetLifecycleConfiguration",
      "s3:GetAccelerateConfiguration",
      "s3:ListBucket",
      "s3:ListBucketVersions",
    ]
    resources = [aws_s3_bucket.terraform_state.arn]
  }

  statement {
    sid       = "ReadOwnStateKey"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:GetObjectVersion"]
    resources = ["${aws_s3_bucket.terraform_state.arn}/bootstrap/*"]
  }
}

resource "aws_iam_role_policy" "bootstrap_plan_state" {
  name   = "BootstrapStateRead"
  role   = aws_iam_role.bootstrap_plan.id
  policy = data.aws_iam_policy_document.bootstrap_state_read.json
}
