################################################################################
# Import blocks for pre-existing live AWS resources (account 139809104139).
# Addresses verified against pinned module sources:
#   route53 v4.1.0, cloudfront v4.2.0, acm v5.2.0, s3-bucket v4.11.0
# NOT imported (intentionally):
#   - vpn.agusgonzaleznic.com A/AAAA records — manually managed, not in TF config
#   - OAI E3LG1Y2B7NO5P2 — vestigial, referenced only as a string in the s3_main
#     bucket policy; no aws_cloudfront_origin_access_identity resource declared
#   - S3 versioning — not enabled live and not declared by the module config
#   - module.acm.aws_acm_certificate_validation.this[0] — resource has no
#     importer in provider v5; first apply creates it instantly (cert is ISSUED)
#   - data.aws_cloudfront_cache_policy.caching_optimized — data source
# Remove this file after the first successful apply.
################################################################################

################################################################################
# Route53
################################################################################

# Hosted zone agusgonzaleznic.com
import {
  to = module.route53.aws_route53_zone.this["agusgonzaleznic.com"]
  id = "Z01244412JIHKLB4766PS"
}

# Apex A (alias -> CloudFront). Records-module key for apex records has a
# leading space: "${name} ${type}" with name = "".
import {
  to = module.route53_records.aws_route53_record.this[" A"]
  id = "Z01244412JIHKLB4766PS_agusgonzaleznic.com_A"
}

# Apex AAAA (alias -> CloudFront)
import {
  to = module.route53_records.aws_route53_record.this[" AAAA"]
  id = "Z01244412JIHKLB4766PS_agusgonzaleznic.com_AAAA"
}

# www CNAME -> CloudFront
import {
  to = module.route53_records.aws_route53_record.this["www CNAME"]
  id = "Z01244412JIHKLB4766PS_www.agusgonzaleznic.com_CNAME"
}

# Apex MX (Google Workspace)
import {
  to = module.route53_records.aws_route53_record.this[" MX"]
  id = "Z01244412JIHKLB4766PS_agusgonzaleznic.com_MX"
}

# Apex TXT (SPF + site verifications)
import {
  to = module.route53_records.aws_route53_record.this[" TXT"]
  id = "Z01244412JIHKLB4766PS_agusgonzaleznic.com_TXT"
}

# DMARC policy TXT
import {
  to = module.route53_records.aws_route53_record.this["_dmarc TXT"]
  id = "Z01244412JIHKLB4766PS__dmarc.agusgonzaleznic.com_TXT"
}

# DKIM TXT — default selector
import {
  to = module.route53_records.aws_route53_record.this["default._domainkey TXT"]
  id = "Z01244412JIHKLB4766PS_default._domainkey.agusgonzaleznic.com_TXT"
}

# DKIM TXT — google selector
import {
  to = module.route53_records.aws_route53_record.this["google._domainkey TXT"]
  id = "Z01244412JIHKLB4766PS_google._domainkey.agusgonzaleznic.com_TXT"
}

# MTA-STS policy TXT
import {
  to = module.route53_records.aws_route53_record.this["_mta-sts TXT"]
  id = "Z01244412JIHKLB4766PS__mta-sts.agusgonzaleznic.com_TXT"
}

# SMTP TLS reporting TXT
import {
  to = module.route53_records.aws_route53_record.this["_smtp._tls TXT"]
  id = "Z01244412JIHKLB4766PS__smtp._tls.agusgonzaleznic.com_TXT"
}

# mta-sts CNAME -> GitHub Pages
import {
  to = module.route53_records.aws_route53_record.this["mta-sts CNAME"]
  id = "Z01244412JIHKLB4766PS_mta-sts.agusgonzaleznic.com_CNAME"
}

# Apex CAA
import {
  to = module.route53_records.aws_route53_record.this[" CAA"]
  id = "Z01244412JIHKLB4766PS_agusgonzaleznic.com_CAA"
}

################################################################################
# CloudFront
################################################################################

# CloudFront distribution (github-pages origin, apex + www aliases)
import {
  to = module.cloudfront.aws_cloudfront_distribution.this[0]
  id = "E33TSNW29S4RDQ"
}

# Response headers policy agusgonzaleznic-com-security-headers
import {
  to = aws_cloudfront_response_headers_policy.security_headers
  id = "a21003ee-2c03-4474-b6d9-23c6fe505af7"
}

# CloudFront function agusgonzaleznic-com-www-redirect (imported by name;
# imports the LIVE stage, consistent with publish = true)
import {
  to = aws_cloudfront_function.www_redirect
  id = "agusgonzaleznic-com-www-redirect"
}

################################################################################
# ACM
################################################################################

# ACM certificate agusgonzaleznic.com + *.agusgonzaleznic.com (us-east-1, ISSUED)
import {
  to = module.acm.aws_acm_certificate.this[0]
  id = "arn:aws:acm:us-east-1:139809104139:certificate/5252733a-e6e7-4161-bf9e-83b791bb885a"
}

# ACM DNS validation CNAME (_b8bb1e4a...agusgonzaleznic.com)
import {
  to = module.acm.aws_route53_record.validation[0]
  id = "Z01244412JIHKLB4766PS__b8bb1e4a477f17ecb964db5bf5784427.agusgonzaleznic.com_CNAME"
}

################################################################################
# S3 — main bucket (agusgonzaleznic.com)
################################################################################

# Bucket agusgonzaleznic.com
import {
  to = module.s3_main.aws_s3_bucket.this[0]
  id = "agusgonzaleznic.com"
}

# Website configuration (index.html / 404.html)
import {
  to = module.s3_main.aws_s3_bucket_website_configuration.this[0]
  id = "agusgonzaleznic.com"
}

# Server-side encryption configuration (AES256)
import {
  to = module.s3_main.aws_s3_bucket_server_side_encryption_configuration.this[0]
  id = "agusgonzaleznic.com"
}

# CORS configuration (single GET rule)
import {
  to = module.s3_main.aws_s3_bucket_cors_configuration.this[0]
  id = "agusgonzaleznic.com"
}

# Bucket policy (OAI E3LG1Y2B7NO5P2 GetObject)
import {
  to = module.s3_main.aws_s3_bucket_policy.this[0]
  id = "agusgonzaleznic.com"
}

# Public access block (all four flags true)
import {
  to = module.s3_main.aws_s3_bucket_public_access_block.this[0]
  id = "agusgonzaleznic.com"
}

################################################################################
# S3 — www redirect bucket (www.agusgonzaleznic.com)
################################################################################

# Bucket www.agusgonzaleznic.com
import {
  to = module.s3_www.aws_s3_bucket.this[0]
  id = "www.agusgonzaleznic.com"
}

# Website configuration (redirect_all_requests_to apex)
import {
  to = module.s3_www.aws_s3_bucket_website_configuration.this[0]
  id = "www.agusgonzaleznic.com"
}

# Server-side encryption configuration (AES256)
import {
  to = module.s3_www.aws_s3_bucket_server_side_encryption_configuration.this[0]
  id = "www.agusgonzaleznic.com"
}

# Public access block (all four flags true)
import {
  to = module.s3_www.aws_s3_bucket_public_access_block.this[0]
  id = "www.agusgonzaleznic.com"
}
