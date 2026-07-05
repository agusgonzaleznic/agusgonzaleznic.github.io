terraform {
  backend "s3" {
    bucket = "agusgonzaleznic-terraform-state"
    key    = "site/terraform.tfstate"
    region = "us-east-1"
    # S3-native lockfile locking (Terraform >= 1.9 opt-in, no DynamoDB needed).
    use_lockfile = true
  }
}
