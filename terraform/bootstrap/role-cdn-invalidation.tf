# CDN invalidation role for the site deploy workflow.
#
# Deliberately separate from the terraform deploy role: that role's trust
# policy excludes `ref:refs/heads/main` (applies go through the gated
# environment), while this role must be assumable by every ordinary deploy:
# push to main and the Storyblok webhook's workflow_dispatch both carry the
# main-ref subject. Blast radius if abused: someone can invalidate the CDN
# cache. Nothing else.

data "aws_iam_policy_document" "cdn_invalidation_trust" {
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
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      # The site's own deploy workflow, plus the drive-berlin app, which is
      # published to GitHub Pages and proxied at /drive-berlin/ through the same
      # distribution. Its deploy has to clear that subtree or the canonical URL
      # serves stale HTML for the CDN's 600s TTL, which is indistinguishable from
      # a failed deploy.
      #
      # drive-berlin is listed TWICE, and the second form is the one that
      # actually matches today. That repository has GitHub's immutable subject
      # claims enabled, so its OIDC token carries numeric IDs rather than names:
      #
      #   repo:agusgonzaleznic@85371331/drive-berlin@1324040618:ref:refs/heads/main
      #
      # 85371331 is the owner ID and 1324040618 is the repository ID, both stable
      # across renames, which is the entire point of the feature: drive-berlin was
      # renamed from german-driving-school, and a name-based subject would have
      # followed the rename rather than the repository.
      #
      # Check the current setting with:
      #   gh api repos/agusgonzaleznic/drive-berlin/actions/oidc/customization/sub
      #
      # The name form is kept so the policy still matches if the setting is ever
      # turned off. It is not a weakening: both subjects denote the same
      # repository under an account only this owner controls. It matters because
      # the consumer of this role tolerates its own failure, so a subject mismatch
      # is silent, and a policy that only matches one of the two settings would
      # break the cache invalidation without anything going red.
      values = [
        "repo:${var.github_org}/${var.github_repo}:ref:refs/heads/main",
        "repo:${var.github_org}/drive-berlin:ref:refs/heads/main",
        "repo:${var.github_org}@85371331/drive-berlin@1324040618:ref:refs/heads/main",
      ]
    }
  }
}

resource "aws_iam_role" "cdn_invalidation" {
  name                 = "github-cdn-invalidation"
  description          = "Assumed by the deploy workflows of ${var.github_org}/${var.github_repo} and ${var.github_org}/drive-berlin (main only) to invalidate the CloudFront cache after a Pages deployment."
  assume_role_policy   = data.aws_iam_policy_document.cdn_invalidation_trust.json
  max_session_duration = 3600
}

data "aws_iam_policy_document" "cdn_invalidation" {
  statement {
    sid    = "InvalidateSiteDistribution"
    effect = "Allow"
    actions = [
      "cloudfront:CreateInvalidation",
      "cloudfront:GetInvalidation",
    ]
    resources = [local.cloudfront_distribution_arn]
  }
}

resource "aws_iam_policy" "cdn_invalidation" {
  name   = "github-cdn-invalidation"
  policy = data.aws_iam_policy_document.cdn_invalidation.json
}

resource "aws_iam_role_policy_attachment" "cdn_invalidation" {
  role       = aws_iam_role.cdn_invalidation.name
  policy_arn = aws_iam_policy.cdn_invalidation.arn
}
