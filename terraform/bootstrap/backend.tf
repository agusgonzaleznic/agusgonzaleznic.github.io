# BOOTSTRAP CHICKEN-AND-EGG: this backend points at the bucket this module
# creates. On the very first apply the bucket does not exist yet — follow the
# runbook in README.md (comment this block out, apply locally, uncomment,
# `terraform init -migrate-state`).
terraform {
  backend "s3" {
    bucket       = "agusgonzaleznic-terraform-state"
    key          = "bootstrap/terraform.tfstate"
    region       = "us-east-1"
    use_lockfile = true
  }
}
