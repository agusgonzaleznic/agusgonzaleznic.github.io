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
