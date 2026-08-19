terraform {
  required_version = ">= 1.14"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# No profile hardcoded. This module normally runs in CI under
# github-terraform-bootstrap, gated by the terraform-bootstrap environment's
# required reviewer (see role-bootstrap-ci.tf). AWS_PROFILE=root-admin is the
# break-glass path only: the first-ever apply, and repairing CI's own identity
# if a change here ever locks the bootstrap roles out.
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
