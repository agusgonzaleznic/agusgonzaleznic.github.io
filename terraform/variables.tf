################################################################################
# AWS
################################################################################

variable "aws_profile" {
  description = "AWS CLI profile name (empty = use ambient credentials, e.g. CI OIDC)"
  type        = string
  default     = ""
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "domain_name" {
  description = "Primary domain name"
  type        = string
  default     = "agusgonzaleznic.com"
}

################################################################################
# Storyblok
################################################################################

variable "space_id" {
  description = "Storyblok Space ID"
  type        = number
  default     = 288632938663524
}

# No default. Pass at runtime via op: TF_VAR_token=$STORYBLOK_MANAGEMENT_TOKEN
variable "token" {
  description = "Storyblok OAuth or Management Token"
  type        = string
  sensitive   = true
}

# Shared secret appended as ?token=... to the webhook Lambda function URL.
# Value lives in SSM /agusgonzaleznic-site/webhook/url-token (managed outside
# TF); no default. Pass via op: TF_VAR_storyblok_webhook_url_token=...
variable "storyblok_webhook_url_token" {
  description = "Query-string token Storyblok sends to the rebuild webhook Lambda"
  type        = string
  sensitive   = true
}

################################################################################
# Cloudflare (Turnstile widget)
################################################################################

# API token scoped to Account > Turnstile > Edit. No default. Pass via op:
# TF_VAR_cloudflare_api_token=... (CI: secrets.CLOUDFLARE_API_TOKEN).
variable "cloudflare_api_token" {
  description = "Cloudflare API token used to manage the Turnstile widget"
  type        = string
  sensitive   = true
}

# Non-secret; no default so the widget is never created against the wrong
# account by accident (CI: vars.CLOUDFLARE_ACCOUNT_ID).
variable "cloudflare_account_id" {
  description = "Cloudflare account ID that owns the Turnstile widget"
  type        = string
}

################################################################################
# Contact form (server-side Lambda)
################################################################################

# The contact Lambda now sends its owner-notification directly via SESv2, so
# the former apps_script_url / apps_script_shared_secret variables are gone.
# Both the sender identity and the From/To addresses are derived in Terraform
# (ses.tf, contact.tf): there is deliberately nothing left to hand-feed here,
# and correspondingly no CONTACT_APPS_SCRIPT_* GitHub secrets to maintain.

################################################################################
# Lambda concurrency
################################################################################

# Reserved concurrency applied to BOTH site Lambdas (contact + storyblok
# rebuild). null means no reservation: each function draws from the shared
# account-wide unreserved pool. That is today's behaviour and null is a plan
# no-op, since provider 5.100.0 plans a null here identically to omitting the
# argument (both resolve to -1, "unreserved"; measured, not assumed).
#
# PRECONDITION, not met today: AWS refuses any reservation that would leave the
# account with less than 100 unreserved concurrency, and this account's applied
# "Concurrent executions" quota is 10 (aws lambda get-account-settings,
# 2026-07-05; re-confirmed via get-service-quota 2026-08-28). Any non-null
# value therefore fails the apply with InvalidParameterValueException.
#
# A Service Quotas increase for L-B99A9384 (Lambda "Concurrent executions") to
# 1000 was requested on 2026-08-28 and is CASE_OPENED, not applied: the applied
# value is still 10, so this MUST stay null until AWS grants it. Re-check with
#   aws service-quotas get-service-quota \
#     --service-code lambda --quota-code L-B99A9384 --region us-east-1
# and only then set a value. The same value goes to both functions, so the
# granted quota must satisfy limit - (2 * value) >= 100.
#
# Setting it IS the isolation fix. While both functions are unreserved they
# share one 10-slot pool, so a flood against /api/contact throttles the
# Storyblok publish webhook as collateral, on a different subsystem, with no
# signal. Note the cost on the contact side: a reservation is a cap as well as
# a floor, so N also caps legitimate concurrent form submissions at N.
variable "lambda_reserved_concurrency" {
  description = "Reserved concurrent executions for each site Lambda (null = unreserved; any value requires the account concurrency quota to leave >=100 unreserved)"
  type        = number
  default     = null

  # 0 is valid to AWS and means "fully throttled, invoke nothing": a plausible
  # typo that would silently take the contact form and the publish pipeline
  # offline. Use null to mean "no reservation".
  validation {
    condition     = var.lambda_reserved_concurrency == null || var.lambda_reserved_concurrency >= 1
    error_message = "lambda_reserved_concurrency must be null (unreserved) or at least 1; 0 would disable both functions."
  }
}
