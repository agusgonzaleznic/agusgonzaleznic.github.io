################################################################################
# ACM Certificate (for CloudFront - must be in us-east-1)
################################################################################

module "acm" {
  source  = "terraform-aws-modules/acm/aws"
  version = "~> 5.0"

  domain_name = local.domain_name
  zone_id     = module.route53.route53_zone_zone_id[local.domain_name]

  subject_alternative_names = [
    "*.${local.domain_name}",
  ]

  validation_method   = "DNS"
  wait_for_validation = true

  tags = local.tags
}
