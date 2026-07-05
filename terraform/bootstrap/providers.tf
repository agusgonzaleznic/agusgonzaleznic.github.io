terraform {
  required_version = ">= 1.14"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# No profile hardcoded: this module is applied ONLY locally by a human with
# AWS_PROFILE=root-admin (SSO). It must never run in CI.
provider "aws" {
  region = "us-east-1"

  default_tags {
    tags = {
      Environment = "Production"
      ManagedBy   = "Terraform"
      Module      = "bootstrap"
    }
  }
}
