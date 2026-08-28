################################################################################
# S3 Bucket - Main (agusgonzaleznic.com)
################################################################################

module "s3_main" {
  source  = "terraform-aws-modules/s3-bucket/aws"
  version = "~> 4.0"

  bucket = local.domain_name

  website = {
    index_document = "index.html"
    error_document = "404.html"
  }

  server_side_encryption_configuration = {
    rule = {
      apply_server_side_encryption_by_default = {
        sse_algorithm = "AES256"
      }
      bucket_key_enabled = false
    }
  }

  # NO bucket policy. The only statement this bucket ever had granted
  # s3:GetObject to CloudFront Origin Access Identity E3LG1Y2B7NO5P2, which is
  # not a resource in this config and is not attached to the distribution
  # (cdn.tf's only origins are github-pages and contact-lambda, so nothing
  # reads either S3 bucket). OAI ids are AWS-assigned: if that OAI were ever
  # deleted, no Terraform run could recreate it, and every apply that re-put
  # the policy would fail MalformedPolicy on a resource serving no traffic.
  # Do not reintroduce a hardcoded principal here; if an origin ever needs to
  # read this bucket, give it an OAC (see contact.tf) or a
  # TF-managed aws_cloudfront_origin_access_identity.

  cors_rule = [
    {
      allowed_headers = ["*"]
      allowed_methods = ["GET"]
      allowed_origins = ["*"]
      max_age_seconds = 0
    }
  ]

  tags = {
    Environment = "Production"
  }
}

################################################################################
# S3 Bucket - WWW redirect (www.agusgonzaleznic.com)
################################################################################

module "s3_www" {
  source  = "terraform-aws-modules/s3-bucket/aws"
  version = "~> 4.0"

  bucket = "www.${local.domain_name}"

  website = {
    redirect_all_requests_to = {
      host_name = local.domain_name
    }
  }

  server_side_encryption_configuration = {
    rule = {
      apply_server_side_encryption_by_default = {
        sse_algorithm = "AES256"
      }
      bucket_key_enabled = false
    }
  }

  tags = {
    Environment = "Production"
  }
}
