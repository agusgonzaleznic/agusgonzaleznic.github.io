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

    # Contact Lambda Function URL (private; reachable only through the OAC in
    # contact.tf). domain_name is the URL host with no scheme/trailing slash.
    "contact-lambda" = {
      domain_name              = trimsuffix(trimprefix(aws_lambda_function_url.contact.function_url, "https://"), "/")
      origin_access_control_id = aws_cloudfront_origin_access_control.contact.id
      custom_origin_config = {
        http_port              = 80
        https_port             = 443
        origin_protocol_policy = "https-only"
        origin_ssl_protocols   = ["TLSv1.2"]
      }
    }
  }

  # /assets/* + /fonts/* -> github-pages, but with a 1-year immutable
  # Cache-Control (the immutable_assets response-headers policy) instead of the
  # origin's max-age=600. These paths hold content-hashed bundles + version-
  # pinned fonts, so repeat visitors reuse them from the browser cache. HTML
  # stays on the default behavior (600s) so deploys still go live fast. Patterns
  # are disjoint, so ordering among these behaviors doesn't matter.
  ordered_cache_behavior = [
    {
      path_pattern           = "/assets/*"
      target_origin_id       = "github-pages"
      viewer_protocol_policy = "redirect-to-https"
      allowed_methods        = ["GET", "HEAD", "OPTIONS"]
      cached_methods         = ["GET", "HEAD"]
      compress               = true
      use_forwarded_values   = false

      cache_policy_id            = aws_cloudfront_cache_policy.immutable_assets.id
      response_headers_policy_id = aws_cloudfront_response_headers_policy.immutable_assets.id
    },
    {
      path_pattern           = "/fonts/*"
      target_origin_id       = "github-pages"
      viewer_protocol_policy = "redirect-to-https"
      allowed_methods        = ["GET", "HEAD", "OPTIONS"]
      cached_methods         = ["GET", "HEAD"]
      compress               = true
      use_forwarded_values   = false

      cache_policy_id            = aws_cloudfront_cache_policy.immutable_assets.id
      response_headers_policy_id = aws_cloudfront_response_headers_policy.immutable_assets.id
    },
    # /api/* -> contact Lambda. CachingDisabled; POST/OPTIONS allowed. The custom
    # origin request policy forwards the true client IP + Origin + Content-Type +
    # payload hash but NOT Host (OAC SigV4 needs the Function-URL Host, which
    # CloudFront supplies). The default (github-pages) behavior is untouched.
    {
      path_pattern           = "/api/*"
      target_origin_id       = "contact-lambda"
      viewer_protocol_policy = "redirect-to-https"
      allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods         = ["GET", "HEAD"]
      compress               = true
      use_forwarded_values   = false

      cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
      origin_request_policy_id = aws_cloudfront_origin_request_policy.api.id
    }
  ]

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

  # Unknown paths return a REAL 404 (not 200 + homepage). This is a fully
  # prerendered SSG — every real route has its own /path/index.html, so nothing
  # relies on a 200 SPA fallback. Serving 200+index.html for missing paths made
  # every junk/stale URL a soft-404 (or a noindex once the client-side NotFound
  # hydrated) in Search Console, and served the homepage as duplicate content on
  # wrong URLs. /404.html is the prerendered NotFound page (robots=noindex).
  custom_error_response = [
    {
      error_code            = 404
      response_code         = 404
      response_page_path    = "/404.html"
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

data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

# Origin request policy for /api/*. Forwards the true client IP
# (CloudFront-Viewer-Address, cache-policy-forbidden — must live here), plus
# Origin, Content-Type, and the POST payload hash CloudFront must sign. Host is
# deliberately NOT forwarded: OAC SigV4 requires the Function-URL Host, which
# CloudFront re-adds. No managed policy fits (they either omit the viewer
# address or force Host).
resource "aws_cloudfront_origin_request_policy" "api" {
  name    = "${replace(local.domain_name, ".", "-")}-api"
  comment = "Forward client IP + Origin + Content-Type to the contact Lambda"

  # NOTE: do NOT list x-amz-content-sha256 here. CloudFront computes and signs
  # that header itself when it SigV4-signs the request to the OAC-protected
  # Lambda Function URL; CloudFront rejects it in an origin-request-policy
  # whitelist ("parameter Headers contains x-amz-content-sha256 that is not
  # allowed"). The browser never sends it either.
  headers_config {
    header_behavior = "whitelist"
    headers {
      items = [
        "CloudFront-Viewer-Address",
        "Origin",
        "Content-Type",
      ]
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
      # Fonts are self-hosted (font-src/style-src 'self'). The Google Tag
      # Manager / Analytics entries are consent-gated activation-ready: GA only
      # loads after opt-in via the consent banner, but the CSP must already
      # allow it.
      # script.google.com / script.googleusercontent.com were removed 2026-08-20:
      # they were allow-listed for the Google Apps Script contact relay, which was
      # decommissioned (the form now POSTs same-origin to /api/* -> Lambda -> SES).
      # Nothing in the codebase references those hosts any more.
      #
      # DO NOT drop 'unsafe-inline' from script-src on its own. It is load-bearing:
      # prerender.mjs rewrites the stylesheet link to the async
      # `rel=preload ... onload="this.rel='stylesheet'"` pattern, and CSP script-src
      # governs inline EVENT HANDLERS as well as <script> elements. Removing it
      # refuses that handler, so the preloaded stylesheet is never promoted and
      # every JS-enabled visitor gets only the inlined above-the-fold CSS on all 85
      # pages. (A hash does not help; inline handlers need 'unsafe-hashes'.) To
      # tighten it, first change the CSS delivery strategy in prerender.mjs.
      #
      # challenges.cloudflare.com in script-src + frame-src: Turnstile loads
      # api.js and renders its challenge in an iframe. connect-src stays 'self'
      # — the contact POST goes to same-origin /api/contact (siteverify is a
      # server-side call from the Lambda, not the browser).
      content_security_policy = "default-src 'self'; script-src 'self' 'unsafe-inline' https://app.storyblok.com https://www.googletagmanager.com https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https: blob:; connect-src 'self' https://api.storyblok.com https://api-us.storyblok.com https://www.google-analytics.com https://analytics.google.com https://*.google-analytics.com; frame-src https://calendar.google.com https://calendar.app.google https://app.storyblok.com https://challenges.cloudflare.com; frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests;"
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

# Long-lived immutable Cache-Control for content-hashed assets (/assets/*) and
# self-hosted fonts (/fonts/*) — used by their ordered cache behaviors above so
# repeat visitors reuse them from the browser cache instead of re-requesting on
# the GitHub Pages origin's max-age=600. Carries the security headers that
# matter for static sub-resources (HSTS, nosniff, CORP for cross-origin font
# fetches, referrer policy); the document-only CSP/frame-options are omitted (a
# CSP on a .js/.woff2 response is inert). HTML keeps the default behavior's
# 600s so content deploys still go live within ~10 minutes.
#
# CAVEAT: /assets/* names are content-hashed (safe to pin forever); /fonts/*
# names are version-pinned but NOT content-hashed — if you ever replace a font
# file in place, rename it or invalidate /fonts/* on the distribution.
resource "aws_cloudfront_response_headers_policy" "immutable_assets" {
  name    = "${replace(local.domain_name, ".", "-")}-immutable-assets"
  comment = "1yr immutable Cache-Control for hashed assets + fonts"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      override                   = true
    }

    content_type_options {
      override = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
  }

  custom_headers_config {
    items {
      header   = "Cache-Control"
      value    = "public, max-age=31536000, immutable"
      override = true
    }

    items {
      header   = "Cross-Origin-Resource-Policy"
      value    = "cross-origin"
      override = true
    }
  }
}

# EDGE TTL for /assets/* and /fonts/*.
#
# WHY THIS EXISTS. The immutable_assets response-headers policy above rewrites
# what the VIEWER is told (1 year, immutable) but changes nothing about what
# CloudFront itself keeps. Managed-CachingOptimized honours the ORIGIN's
# Cache-Control, and the origin is GitHub Pages, which sends max-age=600 for
# every path including /assets/ and /fonts/. So the edge was expiring these
# every 10 minutes while promising browsers a year. Measured: an immutable asset
# response carried `expires` at exactly `date` + 600s alongside
# `cache-control: public, max-age=31536000, immutable`.
#
# The consequence was worst for fonts. index.html sets font-display: optional,
# which gives a face a ~100ms block window and NO swap period: miss it and the
# page renders in metric-matched Georgia and never swaps. Every edge expiry meant
# the next viewer paid an origin fetch inside that window, roughly 144 times a
# day per edge rather than once a year.
#
# min_ttl is the lever: it is a FLOOR CloudFront applies regardless of origin
# headers, so this pins both prefixes at the edge for a year and finally makes
# the immutable promise true on both sides.
#
# CAVEAT, and it is the same one the response-headers policy carries: /assets/*
# is safe by construction because Vite content-hashes those names, so a change is
# a new URL that was never cached. /fonts/* names are version-pinned but NOT
# content-hashed. With a 1-year floor the edge will not revalidate, so replacing
# a font file IN PLACE now serves the old bytes from the edge until invalidated,
# on top of the browser copies that no invalidation can reach. Rename the file
# (preferably content-hash it) rather than swapping it, or invalidate /fonts/* in
# that one deploy.
resource "aws_cloudfront_cache_policy" "immutable_assets" {
  name    = "${replace(local.domain_name, ".", "-")}-immutable-assets-cache"
  comment = "Pin /assets/* + /fonts/* at the edge for 1yr, overriding the origin's max-age=600"

  min_ttl     = 31536000
  default_ttl = 31536000
  max_ttl     = 31536000

  parameters_in_cache_key_and_forwarded_to_origin {
    # Same shape as Managed-CachingOptimized: nothing but the URL in the cache
    # key, both compressions negotiated at the edge.
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true

    cookies_config {
      cookie_behavior = "none"
    }

    headers_config {
      header_behavior = "none"
    }

    query_strings_config {
      query_string_behavior = "none"
    }
  }
}

resource "aws_cloudfront_function" "www_redirect" {
  name    = "${replace(local.domain_name, ".", "-")}-www-redirect"
  runtime = "cloudfront-js-2.0"
  comment = "URL normalisation + www redirect + per-subtree canonical URLs"
  publish = true

  # The handler lives in its own file so it can be UNIT TESTED — see
  # cdn-function/handler.test.mjs, which renders this same template and asserts
  # the full routing table (56 cases). It decides the canonical URL of every
  # page on the site, so a mistake here is a site-wide SEO or availability
  # incident that surfaces in Search Console weeks later; it previously had no
  # tests at all. The rationale for each rule is documented in the handler.
  #
  # `domain_name` is the ONLY template variable. If another is added, update
  # renderHandler() in the test too — it asserts no variable is left
  # unsubstituted, so the test fails rather than silently drifting.
  code = templatefile("${path.module}/cdn-function/handler.js.tftpl", {
    domain_name = local.domain_name
  })
}
