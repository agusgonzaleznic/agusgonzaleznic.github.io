output "deploy_role_arn" {
  description = "IAM role ARN for GitHub Actions — set as repo variable AWS_TF_ROLE_ARN."
  value       = aws_iam_role.github_terraform_deploy.arn
}

output "oidc_provider_arn" {
  description = "GitHub Actions OIDC identity provider ARN."
  value       = module.github_oidc_provider.oidc_provider_arn
}

output "state_bucket_name" {
  description = "Terraform remote state bucket name."
  value       = aws_s3_bucket.terraform_state.bucket
}

output "cdn_invalidation_role_arn" {
  description = "IAM role ARN for post-deploy CloudFront invalidation — set as repo variable AWS_CDN_ROLE_ARN."
  value       = aws_iam_role.cdn_invalidation.arn
}

output "bootstrap_role_arn" {
  description = "IAM role ARN for the gated CI bootstrap apply — set as repo variable AWS_TF_BOOTSTRAP_ROLE_ARN."
  value       = aws_iam_role.bootstrap_write.arn
}

output "bootstrap_plan_role_arn" {
  description = "Read-only IAM role ARN for CI bootstrap plans — set as repo variable AWS_TF_BOOTSTRAP_PLAN_ROLE_ARN."
  value       = aws_iam_role.bootstrap_plan.arn
}

output "site_plan_role_arn" {
  description = "Read-only IAM role ARN for CI site plans on PRs — set as repo variable AWS_TF_PLAN_ROLE_ARN."
  value       = aws_iam_role.site_plan.arn
}
