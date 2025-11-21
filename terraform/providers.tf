terraform {
  required_version = ">= 1.14.0"

  required_providers {
    storyblok = {
      source  = "labd/storyblok"
      version = "~> 1.5"
    }
  }
}

provider "storyblok" {
  # Token will be provided via STORYBLOK_OAUTH_TOKEN environment variable
  # or STORYBLOK_MANAGEMENT_TOKEN for personal access tokens
  url   = "https://mapi.storyblok.com"
  token = var.token
}
