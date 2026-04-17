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
