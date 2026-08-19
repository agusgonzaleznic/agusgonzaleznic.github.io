variable "github_org" {
  description = "GitHub org/user that owns the site repository."
  type        = string
  default     = "agusgonzaleznic"
}

variable "github_repo" {
  description = "GitHub repository allowed to assume the deploy role via OIDC."
  type        = string
  default     = "agusgonzaleznic.github.io"
}

variable "github_environment" {
  description = "GitHub Actions environment name used by apply jobs (appears in the OIDC sub claim). Must match `environment:` in .github/workflows/terraform.yml."
  type        = string
  default     = "terraform-production"
}

variable "github_bootstrap_environment" {
  description = "GitHub Actions environment that gates the BOOTSTRAP apply (appears in the OIDC sub claim). Must match `environment:` on the bootstrap-apply job in .github/workflows/terraform.yml, and must have a required reviewer — it is the only control over an admin-equivalent role."
  type        = string
  default     = "terraform-bootstrap"
}
