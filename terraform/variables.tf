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