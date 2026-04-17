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

  attach_policy = true
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = ""
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity E3LG1Y2B7NO5P2" }
        Action    = "s3:GetObject"
        Resource  = "arn:aws:s3:::${local.domain_name}/*"
      }
    ]
  })

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
