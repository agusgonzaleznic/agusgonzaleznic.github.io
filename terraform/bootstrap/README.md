# bootstrap — state bucket + GitHub OIDC roles

Self-contained root module. It creates the things CI itself depends on: the S3
remote-state bucket, the GitHub OIDC identity provider, and every IAM role and
policy that grants CI its permissions — including the deploy role's whole
permission surface and the Lambda execution boundary.

**This module now runs in CI**, under its own OIDC roles and its own gated
GitHub environment. `AWS_PROFILE=root-admin` is the break-glass path only.

## Why it is a separate tier at all

Adopting a new AWS service needs two things granted before the site module can
use them, and they cannot both land in one apply:

- **deploy-time** permissions for the deploy role (e.g. `ses:CreateEmailIdentity`)
- **runtime** permissions inside `agusgonzaleznic-lambda-exec-boundary`
  (e.g. `ses:SendEmail`)

A single `terraform apply` that both grants a permission and consumes it is
unreliable by construction: Terraform only orders operations joined by a
dependency edge, IAM is eventually consistent, and — decisively — **data
sources are read at plan time**, before any apply step in the same run.
`data.aws_cloudfront_cache_policy`, `data.aws_kms_alias` and
`data.aws_caller_identity` are already read on every plan, so a grant applied
later in that run can never satisfy them.

So the target is not one apply. It is **one PR, one workflow run, zero local
commands** — which is what the workflow now does, by chaining
`bootstrap-apply` ahead of the site `apply`.

The rejected alternative (letting the *deploy* role manage its own policies
under a permissions boundary) and exactly why it is escapable is written up at
the top of `role-bootstrap-ci.tf`. Read that before reviving the idea.

## The two CI roles

| Role | Trusted subject | Permissions | Used by |
|---|---|---|---|
| `github-terraform-bootstrap-plan` | `pull_request`, `ref:refs/heads/main` | `IAMReadOnlyAccess` + `s3:Get*`/`List*` on the state bucket, objects `bootstrap/*` only | `bootstrap-plan`, `bootstrap-detect` |
| `github-terraform-plan` | `pull_request` only | `ReadOnlyAccess`, plus `kms:Decrypt` via SSM, minus Denies on parameter values outside `/agusgonzaleznic-site/*`, log events, object bodies other than state `site/*`, and the DynamoDB data plane | `plan` (site tier) |
| `github-terraform-bootstrap` | `environment:terraform-bootstrap` **only** | `IAMFullAccess` + `s3:*` on the state bucket (config mgmt; `DeleteBucket` denied by the ceiling), objects `bootstrap/*` only — all capped by `agusgonzaleznic-bootstrap-ceiling` | `bootstrap-apply` |

The S3 statements are deliberately wildcards, not enumerated verbs: the
`aws_s3_bucket` resource family reads a provider-version-dependent set of
sub-configurations on every refresh, and an enumerated list silently breaks when
that set grows (it did, in this module's first CI run). The write role owns the
bucket's configuration; the plan role's verbs are read-only by construction. The
same reasoning shapes the ceiling: **Allow-\* plus targeted Denies, never an
enumerated allow-list** — an enumerated ceiling on the one role CI depends on is
a single point of failure repairable only via break-glass. Do not "tighten" it
into an allow-list; that is the exact failure mode the shape exists to prevent.
Besides the Denies listed below, the ceiling also denies re-versioning or
deleting its own policy document (`DenyRewritingOwnCeiling`).

Split on purpose: a PR plan runs code from a branch and must never hold `iam:`
write. The write role is unassumable from any PR job, from `deploy.yml`, or from
any other main-branch job holding `id-token: write`, because declaring
`environment:` **replaces** the ref form in the OIDC `sub` claim.

`github-terraform-bootstrap` is **admin-equivalent and cannot be made
otherwise** — it is the tier that decides who may do what. Its ceiling blocks
persistence and lateral paths this module never needs (IAM users, access keys,
SSO/Organizations roles, shedding its own boundary, deleting the state bucket);
it does not pretend to contain a compromised *approved* run. The real control is
the `terraform-bootstrap` environment's **required reviewer**. Compared with the
status quo this is a narrowing: the previous mechanism was a human holding full
root-admin SSO credentials with no plan recorded anywhere.

## Day-2 changes (the normal path)

Edit this module in the same PR as the site change that needs it. Then:

1. PR → `bootstrap-plan` posts the plan to the job summary.
2. Merge → `bootstrap-detect` re-plans read-only and publishes it, so you see
   the diff **before** the approval prompt appears.
3. Approve `terraform-bootstrap` → `bootstrap-apply` re-plans under the write
   role (`-out=tfplan`) and applies **that** plan — the detect job's plan is not
   reusable (different role, and an unlocked plan is not a safe apply input).
   Drift between detect and apply is therefore applied without re-approval;
   the apply-time plan is published to the job summary for after-the-fact review.
   The job ends with a deliberate `sleep 20` — IAM is eventually consistent and
   the site plan immediately uses whatever was just granted; the sleep is
   load-bearing, not cruft.
4. Approve `terraform-production` → the site applies, now with the permissions
   it needs.

`bootstrap-apply` is skipped entirely when this module has no changes, so
routine site-only merges still need exactly one approval. Detection is by
`terraform plan -detailed-exitcode`, not by changed paths — a path filter is
wrong in both directions (it prompts on no-op merges and misses drift or a
module version bump). One honest caveat: the *workflow itself* still triggers on
`terraform/**` paths (plus `workflow_dispatch`), so drift is only caught when a
run happens at all. A failed apply is recovered with `workflow_dispatch` from
`main`, which re-executes the full detect → gated apply → site apply chain.

## Enabling this (one-time, and the only human applies that remain)

The very first apply cannot come from CI: it creates the roles CI would need to
assume. Order matters — create the environment **with its reviewer** before the
role exists, so there is never a window where an ungated environment can reach a
write-capable role.

```sh
# 1. GitHub environment WITH a required reviewer, first.
gh api -X PUT repos/agusgonzaleznic/agusgonzaleznic.github.io/environments/terraform-bootstrap \
  -f 'reviewers[][type]=User' -F "reviewers[][id]=$(gh api user --jq .id)"

# 2. Create the roles + ceiling.
cd terraform/bootstrap
export AWS_PROFILE=root-admin   # aws sso login --profile root-admin first
terraform init && terraform plan && terraform apply

# 3. Wire the ARNs into the repo variables that gate the new jobs.
gh variable set AWS_TF_BOOTSTRAP_ROLE_ARN --repo agusgonzaleznic/agusgonzaleznic.github.io \
  --body "$(terraform output -raw bootstrap_role_arn)"
gh variable set AWS_TF_BOOTSTRAP_PLAN_ROLE_ARN --repo agusgonzaleznic/agusgonzaleznic.github.io \
  --body "$(terraform output -raw bootstrap_plan_role_arn)"
```

Until both variables are set the bootstrap jobs **skip** rather than fail, which
is what lets the workflow merge before step 2.

## Break-glass

Use `AWS_PROFILE=root-admin` locally only when:

- **First-ever apply of this module** (the state bucket does not exist yet, so
  `backend.tf` points at nothing — comment the `backend "s3"` block out, apply
  with local state, uncomment, `terraform init -migrate-state`, then delete the
  local `terraform.tfstate*`). `terraform init` performs live S3 calls before it
  builds a resource graph and a `backend` block cannot reference resources, so
  this circularity has no in-Terraform solution.
- **CI locked itself out** — a change here broke the bootstrap roles' own trust
  or permissions. Nothing in CI can repair CI's identity.

## Wiring outputs into GitHub

| Output | Where it goes |
|---|---|
| `deploy_role_arn` | repo variable `AWS_TF_ROLE_ARN` |
| `site_plan_role_arn` | repo variable `AWS_TF_PLAN_ROLE_ARN` |
| `cdn_invalidation_role_arn` | repo variable `AWS_CDN_ROLE_ARN` |
| `bootstrap_role_arn` | repo variable `AWS_TF_BOOTSTRAP_ROLE_ARN` |
| `bootstrap_plan_role_arn` | repo variable `AWS_TF_BOOTSTRAP_PLAN_ROLE_ARN` |
| `oidc_provider_arn` | reference only |
| `state_bucket_name` | already hardcoded in both modules' backend config |

## The third role: `github-cdn-invalidation`

Not part of the plan/apply tiers, but owned by this module
(`role-cdn-invalidation.tf`): a dedicated role for post-deploy CloudFront
invalidation, holding exactly two actions (`CreateInvalidation`,
`GetInvalidation`). Its trust is deliberately **broader** than the deploy
role's — it accepts `main`-ref subjects from this repo AND from
`agusgonzaleznic/drive-berlin` (proxied at `/drive-berlin/` through the same
distribution, so it must invalidate the shared cache). That broader trust is
exactly why it is a separate role: blast radius if abused is cache
invalidation, nothing else.

## Notes

- The state bucket has `prevent_destroy` (an HCL guard, invisible to IAM) and the
  ceiling additionally denies `s3:DeleteBucket` on it.
- The deploy role trusts ONLY `environment:terraform-production`. It used to
  trust `pull_request` as well, which meant a PR branch held the same write
  credentials as the gated apply: the environment gates the apply JOB, never the
  CREDENTIAL. Site PR plans now assume the read-only `github-terraform-plan`
  instead. There is deliberately no `ref:refs/heads/main` subject either, since it
  would let any main-branch job with `id-token: write` assume a write-capable
  role.
- Because declaring `environment:` in a job mints that subject for ANY event,
  not just a push, both gated environments are pinned to the `main` branch.
  Without that pin, branch code declaring `environment: terraform-production`
  would mint exactly the subject the deploy role trusts, leaving the required
  reviewer as the only control.
- The deploy role is denied `s3:*` on `bootstrap/*` state keys and access to its
  own IAM resources. That separation is what makes this tier meaningful, so do
  not relax it to save an apply.
- `use_lockfile = true` means `s3:DeleteObject` on the state prefix is not
  optional: without it an unclearable `.tflock` blocks every later run. The plan
  role has no write access at all, which is why the plan jobs pass `-lock=false`.
