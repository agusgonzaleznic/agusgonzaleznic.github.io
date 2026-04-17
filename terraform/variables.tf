################################################################################
# AWS
################################################################################

variable "aws_profile" {
  description = "AWS CLI profile name"
  type        = string
  default     = "AGNAdministratorAccess"
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
  default     = 0
}

variable "token" {
  description = "Storyblok OAuth or Management Token"
  type        = string
  default     = ""
}