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

# No default — pass at runtime via op: TF_VAR_token=$STORYBLOK_MANAGEMENT_TOKEN
variable "token" {
  description = "Storyblok OAuth or Management Token"
  type        = string
  sensitive   = true
}

# Shared secret appended as ?token=... to the webhook Lambda function URL.
# Value lives in SSM /agusgonzaleznic-site/webhook/url-token (managed outside
# TF); no default — pass via op: TF_VAR_storyblok_webhook_url_token=...
variable "storyblok_webhook_url_token" {
  description = "Query-string token Storyblok sends to the rebuild webhook Lambda"
  type        = string
  sensitive   = true
}

################################################################################
# Cloudflare (Turnstile widget)
################################################################################

# API token scoped to Account > Turnstile > Edit. No default — pass via op:
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
# (ses.tf, contact.tf) — there is deliberately nothing left to hand-feed here,
# and correspondingly no CONTACT_APPS_SCRIPT_* GitHub secrets to maintain.
