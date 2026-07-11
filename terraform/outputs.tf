output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = module.cloudfront.cloudfront_distribution_id
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name"
  value       = module.cloudfront.cloudfront_distribution_domain_name
}

output "acm_certificate_arn" {
  description = "ACM certificate ARN"
  value       = module.acm.acm_certificate_arn
}

output "website_url" {
  description = "Website URL"
  value       = "https://${local.domain_name}"
}

output "webhook_function_url" {
  description = "Storyblok rebuild webhook Function URL (append ?token=...)"
  value       = aws_lambda_function_url.webhook.function_url
}

# Public by nature (ships in the client bundle). Set as repo VARIABLE
# TURNSTILE_SITE_KEY after first apply. NOT sensitive.
output "turnstile_sitekey" {
  description = "Cloudflare Turnstile public sitekey"
  value       = cloudflare_turnstile_widget.contact.sitekey
}

# Debugging only. Direct public invocation is blocked (AWS_IAM + OAC); reach it
# via the CloudFront /api/* behavior.
output "contact_function_url" {
  description = "Contact Lambda Function URL"
  value       = aws_lambda_function_url.contact.function_url
}
