locals {
  space_id    = var.space_id
  domain_name = var.domain_name

  tags = {
    Environment = "Production"
    ManagedBy   = "Terraform"
  }
}
