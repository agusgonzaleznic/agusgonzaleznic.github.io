# GitHub Actions OIDC federation.
#
# The module is used ONLY for the OIDC identity provider
# (create_oidc_role = false). Its built-in role is skipped on purpose:
# the module's trust policy has no `aud` condition (audience is enforced
# only via the provider's client_id_list) and its `oidc_role` output does
# not reliably expose the role ARN. We hand-write the role below so the
# trust policy pins both `aud` and the exact `sub` claims, and so the ARN
# can be output for the AWS_TF_ROLE_ARN repo variable.
module "github_oidc_provider" {
  source  = "terraform-module/github-oidc-provider/aws"
  version = "2.2.2"

  create_oidc_provider = true
  create_oidc_role     = false
}

data "aws_iam_policy_document" "github_oidc_trust" {
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

    # The environment subject and NOTHING else.
    #
    # `:pull_request` used to be listed here so PR plans could refresh state, and
    # that made this write-capable role reachable from any branch: the
    # environment gates the apply JOB, never the CREDENTIAL. Site PR plans now
    # assume github-terraform-plan (role-site-plan.tf), which is read-only, so
    # the PR subject has no reason to appear on this role.
    #
    # The apply job declares `environment:`, which REPLACES the ref form in the
    # sub claim, so the environment subject is the only apply subject. That is a
    # claim about IAM plus a GitHub-side branch rule, not about IAM alone:
    # declaring an environment mints that subject for ANY event, so the
    # terraform-production environment is also pinned to the `main` branch (as
    # terraform-bootstrap already was). Without that pin, branch code declaring
    # `environment: terraform-production` would mint exactly this subject.
    #
    # Deliberately NO `ref:refs/heads/main` entry: it would let ANY main-branch
    # job with id-token:write (e.g. deploy.yml) assume this role.
    #
    # StringEquals rather than StringLike: there is no wildcard to express, and
    # StringLike on a pattern with no metacharacters only invites one being
    # added later.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_org}/${var.github_repo}:environment:${var.github_environment}",
      ]
    }
  }
}

resource "aws_iam_role" "github_terraform_deploy" {
  name                 = "github-terraform-deploy"
  description          = "Assumed by GitHub Actions (${var.github_org}/${var.github_repo}) via OIDC to plan/apply the site Terraform."
  assume_role_policy   = data.aws_iam_policy_document.github_oidc_trust.json
  max_session_duration = 3600
}
