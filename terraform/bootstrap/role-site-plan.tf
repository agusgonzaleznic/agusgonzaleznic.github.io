################################################################################
# Site plan role: read-only, and the only role a site-tier PR job may assume.
#
# WHY THIS EXISTS
#
# The site `Plan (PR)` job used to assume github-terraform-deploy: the SAME
# write-capable role as the gated apply, because that role's trust allowed the
# `:pull_request` subject. The terraform-production environment gates the apply
# JOB, but it never gated the CREDENTIAL, so a PR branch could hold
# lambda:*, s3:*, iam:CreateRole and the rest without any approval being sought.
# The bootstrap tier has had a read-only plan twin since role-bootstrap-ci.tf;
# this is the site tier's, and it closes that asymmetry.
#
# WHY ReadOnlyAccess RATHER THAN AN ENUMERATED READ LIST
#
# The site module refreshes ~90 resources across a dozen services plus several
# registry modules, and which read calls a refresh makes is provider-version
# specific. A hand-kept read allow-list fails CLOSED in the worst way: an
# omission is not a security event, it is a red PR plan on unrelated work, and
# the fix costs a gated bootstrap apply. The deploy role's own history carries
# two grants that were discovered only by a failed run.
#
# The cost of the managed policy is honest and bounded: it grants account-wide
# READ of everything not denied below. That is strictly narrower than today on
# write, which is the entire point, and broader on metadata. The four Denies
# close the channels that return SECRETS or PERSONAL DATA, because this role's
# output is posted to a world-readable sticky PR comment.
#
# The Allow and the Denies were MEASURED against ReadOnlyAccess v188 (2,912
# action patterns), not reasoned about:
#   * of 42 read actions a site plan makes, kms:Decrypt is the ONLY one the
#     managed policy does not grant, hence the Allow below. Without it every
#     PR plan fails refreshing the SecureString parameters.
#   * secretsmanager:GetSecretValue is NOT granted, so it needs no Deny.
#   * budgets:ListTagsForResource IS granted (a suspected gap that is not one).
################################################################################

data "aws_iam_policy_document" "site_plan_trust" {
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

    # `pull_request` and NOTHING else. Deliberately no `ref:refs/heads/main`
    # entry (that would let any main-branch job with id-token:write assume this
    # role), and deliberately no `environment:` entry, since an environment
    # subject is the apply path's, not a plan's. StringEquals rather than
    # StringLike: there is no wildcard to express, and StringLike on a
    # pattern with no metacharacters only invites one being added later.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_org}/${var.github_repo}:pull_request"]
    }
  }
}

resource "aws_iam_role" "site_plan" {
  name                 = "github-terraform-plan"
  description          = "Read-only role for `terraform plan` of terraform/ from PRs. Holds no write permission of any kind."
  assume_role_policy   = data.aws_iam_policy_document.site_plan_trust.json
  max_session_duration = 3600
}

resource "aws_iam_role_policy_attachment" "site_plan_readonly" {
  role       = aws_iam_role.site_plan.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

data "aws_iam_policy_document" "site_plan_addendum" {
  # The one gap in ReadOnlyAccess. Scoped through SSM exactly as the
  # lambda-exec boundary scopes the same grant, so this cannot decrypt anything
  # except by asking SSM for a parameter it is also allowed to read.
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

  # ReadOnlyAccess grants ssm:Get*, which returns parameter VALUES account-wide.
  # The site's own parameters have to stay readable (the plan refreshes them),
  # so this denies every parameter OUTSIDE that prefix rather than the action.
  statement {
    sid     = "DenyParameterValuesOutsideSite"
    effect  = "Deny"
    actions = ["ssm:Get*"]
    not_resources = [
      "arn:aws:ssm:us-east-1:${local.account_id}:parameter/agusgonzaleznic-site/*",
    ]
  }

  # Log CONTENT, not log metadata. DescribeLogGroups / DescribeMetricFilters /
  # ListTagsForResource are what a refresh needs and are untouched. These six
  # return log EVENTS, and the contact Lambda's group holds 30 days of
  # submitter IP addresses, personal data this role has no reason to read and
  # every reason not to, given where its output is published.
  statement {
    sid    = "DenyLogContent"
    effect = "Deny"
    actions = [
      "logs:GetLogEvents",
      "logs:FilterLogEvents",
      "logs:StartQuery",
      "logs:GetQueryResults",
      "logs:GetLogRecord",
      "logs:StartLiveTail",
    ]
    resources = ["*"]
  }

  # Object bodies. The site module manages bucket CONFIGURATION, never objects,
  # so the only object it must read is its own state. This therefore also denies
  # the bootstrap tier's state. A site plan has no business reading the state
  # that describes every IAM role in the account.
  statement {
    sid     = "DenyObjectBodiesExceptOwnState"
    effect  = "Deny"
    actions = ["s3:GetObject", "s3:GetObjectVersion"]
    not_resources = [
      "${aws_s3_bucket.terraform_state.arn}/site/*",
    ]
  }

  # DynamoDB data plane. A refresh needs DescribeTable/DescribeTimeToLive/
  # DescribeContinuousBackups, all metadata. The contact table's items are
  # rate-limit and duplicate-suppression rows keyed by hashed email and by
  # client IP, so the same argument as the log content applies.
  statement {
    sid    = "DenyTableData"
    effect = "Deny"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:BatchGetItem",
      "dynamodb:Query",
      "dynamodb:Scan",
      "dynamodb:PartiQLSelect",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "site_plan_addendum" {
  name   = "ReadOnlyAccessAddendum"
  role   = aws_iam_role.site_plan.id
  policy = data.aws_iam_policy_document.site_plan_addendum.json
}
