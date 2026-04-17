terraform {
  required_version = ">= 1.14.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    storyblok = {
      source  = "labd/storyblok"
      version = "~> 1.5"
    }
  }
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile
}

provider "storyblok" {
  url   = "https://mapi.storyblok.com"
  token = var.token
}
