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

    # No origin request policy: CloudFront sends Host = origin domain name
    # (agusgonzaleznic.github.io) so it negotiates origin TLS against the valid
    # *.github.io cert. Forwarding the viewer Host (the apex) made CloudFront hit
    # GitHub's custom-domain cert, which expires/breaks because GitHub can't run
    # its ACME renewal once the domain points at CloudFront -> 502 Bad Gateway.
    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_optimized.id
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

resource "aws_cloudfront_response_headers_policy" "security_headers" {
  name    = "${replace(local.domain_name, ".", "-")}-security-headers"
  comment = "Security headers for ${local.domain_name}"

  security_headers_config {
    content_security_policy {
      # Fonts are self-hosted (font-src/style-src 'self'). The Google Tag
      # Manager / Analytics entries are consent-gated activation-ready: GA only
      # loads after opt-in via the consent banner, but the CSP must already
      # allow it.
      content_security_policy = "default-src 'self'; script-src 'self' 'unsafe-inline' https://script.google.com https://script.googleusercontent.com https://app.storyblok.com https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https: blob:; connect-src 'self' https://script.google.com https://script.googleusercontent.com https://api.storyblok.com https://api-us.storyblok.com https://www.google-analytics.com https://analytics.google.com https://*.google-analytics.com; frame-src https://calendar.google.com https://calendar.app.google https://app.storyblok.com; frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests;"
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
  comment = "Redirect www to apex; add trailing slash to extensionless paths"
  publish = true

  # The trailing-slash 301 must happen HERE, not at the origin: CloudFront
  # sends Host = agusgonzaleznic.github.io to GitHub Pages (see the cache
  # behavior comment above), so any origin-generated directory redirect
  # carries the github.io domain in its Location and teleports visitors off
  # the apex. Prerendered routes are directories (/blog/<slug>/index.html),
  # so every extensionless path needs the slash before it reaches Pages.
  code = <<-EOF
    function handler(event) {
      var request = event.request;
      var host = request.headers.host.value;
      var uri = request.uri;

      var needsSlash =
        !uri.endsWith('/') && !uri.split('/').pop().includes('.');
      var isWww = host.startsWith('www.');

      if (isWww || needsSlash) {
        var qs = '';
        for (var key in request.querystring) {
          qs += (qs === '' ? '?' : '&') + key;
          var v = request.querystring[key];
          if (v.multiValue) {
            qs += '=' + v.multiValue.map(function (m) { return m.value; }).join('&' + key + '=');
          } else if (v.value !== '') {
            qs += '=' + v.value;
          }
        }
        return {
          statusCode: 301,
          statusDescription: 'Moved Permanently',
          headers: {
            location: {
              value: 'https://${local.domain_name}' + uri + (needsSlash ? '/' : '') + qs
            }
          }
        };
      }
      return request;
    }
  EOF
}
