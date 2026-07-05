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
