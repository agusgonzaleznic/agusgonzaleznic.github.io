# bootstrap — state bucket + GitHub OIDC deploy role

Self-contained root module. **Applied ONLY locally by a human** with
`AWS_PROFILE=root-admin` — never from CI. It creates the two things CI itself
depends on: the S3 remote-state bucket and the OIDC-federated deploy role,
which is why CI can never own it (and why the deploy role is explicitly
denied access to `bootstrap/*` state keys and to its own IAM resources).

## BOOTSTRAP RUNBOOK (first apply — chicken-and-egg)

`backend.tf` points at the state bucket that this very module creates, so the
first apply must run with local state and then migrate.

### Step 1 — first apply with local state

```sh
cd terraform/bootstrap
# Comment out the entire `terraform { backend "s3" { ... } }` block in backend.tf
export AWS_PROFILE=root-admin   # aws sso login --profile root-admin first if needed
terraform init
terraform plan
terraform apply
```

### Step 2 — migrate state into the new bucket

```sh
# Uncomment the backend block in backend.tf
terraform init -migrate-state   # answer "yes" to copy local state to s3://agusgonzaleznic-terraform-state/bootstrap/terraform.tfstate
rm -f terraform.tfstate terraform.tfstate.backup   # local copies are now redundant; never commit them
```

### Step 3 — wire outputs into GitHub

```sh
terraform output
```

| Output | Where it goes |
|---|---|
| `deploy_role_arn` | GitHub repo **variable** `AWS_TF_ROLE_ARN` (`gh variable set AWS_TF_ROLE_ARN --repo agusgonzaleznic/agusgonzaleznic.github.io --body "<arn>"`) |
| `oidc_provider_arn` | Reference only (nothing to configure) |
| `state_bucket_name` | Already hardcoded in the site module's backend config (`key = site/terraform.tfstate`) |

## Day-2 changes

```sh
export AWS_PROFILE=root-admin
terraform init   # backend already migrated; no flags needed
terraform plan && terraform apply
```

Notes:

- The state bucket has `prevent_destroy` — deleting it requires editing this
  module on purpose.
- The deploy role trusts only `repo:agusgonzaleznic/agusgonzaleznic.github.io`
  subjects: `pull_request` (plan) and `environment:terraform-production`
  (apply — must match `environment:` in `.github/workflows/terraform.yml`).
  There is deliberately no `ref:refs/heads/main` subject.
