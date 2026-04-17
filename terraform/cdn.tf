################################################################################
# CloudFront Distribution
################################################################################

module "cloudfront" {
  source  = "terraform-aws-modules/cloudfront/aws"
  version = "~> 4.0"

  aliases             = [local.domain_name, "www.${local.domain_name}"]
  comment             = local.domain_name
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  wait_for_deployment = true
  http_version        = "http2and3"

  origin = {
    "github-pages" = {
      domain_name = "agusgonzaleznic.github.io"
      custom_origin_config = {
        http_port              = 80
        https_port             = 443
        origin_protocol_policy = "https-only"
        origin_ssl_protocols   = ["TLSv1.2"]
      }
    }
  }

  default_cache_behavior = {
    target_origin_id       = "github-pages"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    use_forwarded_values   = false

    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_optimized.id
    origin_request_policy_id   = aws_cloudfront_origin_request_policy.github_pages.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security_headers.id

    function_association = {
      viewer-request = {
        function_arn = aws_cloudfront_function.www_redirect.arn
      }
    }
  }

  custom_error_response = [
    {
      error_code            = 404
      response_code         = 200
      response_page_path    = "/index.html"
      error_caching_min_ttl = 10
    }
  ]

  viewer_certificate = {
    acm_certificate_arn      = module.acm.acm_certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  geo_restriction = {
    restriction_type = "none"
  }

  tags = local.tags
}

################################################################################
# Supporting Resources (not supported inline by the CloudFront module)
################################################################################

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

resource "aws_cloudfront_origin_request_policy" "github_pages" {
  name    = "${replace(local.domain_name, ".", "-")}-github-pages"
  comment = "Forward Host header to GitHub Pages origin"

  headers_config {
    header_behavior = "whitelist"
    headers {
      items = ["Host"]
    }
  }

  cookies_config {
    cookie_behavior = "none"
  }

  query_strings_config {
    query_string_behavior = "none"
  }
}

resource "aws_cloudfront_response_headers_policy" "security_headers" {
  name    = "${replace(local.domain_name, ".", "-")}-security-headers"
  comment = "Security headers for ${local.domain_name}"

  security_headers_config {
    content_security_policy {
      content_security_policy = "default-src 'self'; script-src 'self' 'unsafe-inline' https://script.google.com https://script.googleusercontent.com https://app.storyblok.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' https://script.google.com https://script.googleusercontent.com https://api.storyblok.com https://api-us.storyblok.com; frame-src https://calendar.google.com https://calendar.app.google https://app.storyblok.com; frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests;"
      override                = true
    }

    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      override                   = true
    }

    content_type_options {
      override = true
    }

    frame_options {
      frame_option = "DENY"
      override     = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
  }

  custom_headers_config {
    items {
      header   = "Cross-Origin-Opener-Policy"
      value    = "same-origin"
      override = true
    }

    items {
      header   = "Cross-Origin-Resource-Policy"
      value    = "cross-origin"
      override = true
    }

    items {
      header   = "Permissions-Policy"
      value    = "geolocation=(), microphone=(), camera=()"
      override = true
    }
  }
}

resource "aws_cloudfront_function" "www_redirect" {
  name    = "${replace(local.domain_name, ".", "-")}-www-redirect"
  runtime = "cloudfront-js-2.0"
  comment = "Redirect www to apex domain"
  publish = true

  code = <<-EOF
    function handler(event) {
      var request = event.request;
      var host = request.headers.host.value;
      if (host.startsWith('www.')) {
        return {
          statusCode: 301,
          statusDescription: 'Moved Permanently',
          headers: {
            location: { value: 'https://${local.domain_name}' + request.uri }
          }
        };
      }
      return request;
    }
  EOF
}
