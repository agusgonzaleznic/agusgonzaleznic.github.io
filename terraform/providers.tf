terraform {
  required_version = ">= 1.14.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
    storyblok = {
      source  = "labd/storyblok"
      version = "~> 1.5"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
  # Empty profile -> null so CI can authenticate via OIDC env credentials;
  # local users pass -var aws_profile=... or set AWS_PROFILE.
  profile = var.aws_profile == "" ? null : var.aws_profile
}

provider "storyblok" {
  url   = "https://mapi.storyblok.com"
  token = var.token
}

# Cloudflare provider v5 removed the provider-level account_id argument;
# account scope is set per-resource (cloudflare_turnstile_widget.account_id =
# var.cloudflare_account_id in contact.tf). Only the API token lives here.
provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
