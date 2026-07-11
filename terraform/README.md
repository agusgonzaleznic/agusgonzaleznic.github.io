# Terraform — agusgonzaleznic.com

Infrastructure for the site: Route53, ACM, CloudFront, S3 (AWS account
`139809104139`, `us-east-1`) plus Storyblok resources (space
`288632938663524`, EU / `mapi.storyblok.com`).

## Architecture

Two root modules with a strict trust boundary:

| Module | Path | State | Who applies |
|---|---|---|---|
| **bootstrap** | `terraform/bootstrap/` | S3 (self-migrated, see runbook) | **Human only**, locally with `AWS_PROFILE=root-admin` |
| **site** | `terraform/` | S3 backend, `use_lockfile = true` (native S3 locking, no DynamoDB) | **CI only** (`.github/workflows/terraform.yml`) via GitHub OIDC |

- `bootstrap/` owns the chicken-and-egg pieces: the S3 state bucket, the
  GitHub OIDC identity provider, and the IAM role CI assumes. It is never
  planned or applied by CI — the workflow has an explicit guard step that
  fails if it ever targets `bootstrap/`.
- The site module owns everything else: DNS zone + records, ACM cert,
  CloudFront distribution / function / response-headers policy, S3 website
  buckets, and Storyblok webhook resources.
- The CI role's trust policy must allow exactly these OIDC subjects:
  - `repo:agusgonzaleznic/agusgonzaleznic.github.io:pull_request` (plan job)
  - `repo:agusgonzaleznic/agusgonzaleznic.github.io:environment:terraform-production` (apply job — the environment name replaces the ref in the subject)

Deliberately **not** managed here:

- A manually-managed subdomain's A/AAAA records (a personal-network endpoint,
  out of Terraform scope) — never import or define them.
- SSM SecureStrings `/agusgonzaleznic-site/webhook/github-pat` and
  `/agusgonzaleznic-site/webhook/url-token` — referenced by name only; their
  values are never data-read into state. Rotating the url-token means:
  update the SSM parameter, update the `STORYBLOK_WEBHOOK_URL_TOKEN` repo
  secret, and re-apply so the Storyblok webhook endpoint is rewritten.
- Storyblok stories/content (blog folder, draft posts) — the labd/storyblok
  provider has no story resource. Component **schemas** ARE managed in HCL
  (`storyblok.tf`); only content stays in the CMS.

## Bootstrap runbook (one-time, chicken-and-egg)

Prereqs: `aws sso login --profile root-admin`, `gh auth status` OK, `op`
signed in.

1. **Apply bootstrap with local state** (the state bucket does not exist
   yet, so its own backend block must start commented out):

   ```sh
   cd terraform/bootstrap
   # ensure the backend "s3" block in this module is COMMENTED OUT
   AWS_PROFILE=root-admin terraform init
   AWS_PROFILE=root-admin terraform plan
   AWS_PROFILE=root-admin terraform apply
   ```

   This creates the state bucket, the GitHub OIDC provider, and the CI IAM
   role.

2. **Migrate bootstrap's own state into the bucket it just created**:

   ```sh
   # UNCOMMENT the backend "s3" block in bootstrap
   AWS_PROFILE=root-admin terraform init -migrate-state   # answer "yes"
   ```

   Verify: `AWS_PROFILE=root-admin terraform plan` shows no changes, and the
   local `terraform.tfstate` / `.backup` files can be deleted (they are
   gitignored anyway).

3. **Wire the GitHub repo variables** (non-secret):

   ```sh
   # still in terraform/bootstrap — output name per bootstrap/outputs.tf
   gh variable set AWS_TF_ROLE_ARN \
     --body "$(AWS_PROFILE=root-admin terraform output -raw deploy_role_arn)"
   gh variable set AWS_CDN_ROLE_ARN \
     --body "$(AWS_PROFILE=root-admin terraform output -raw cdn_invalidation_role_arn)"
   gh variable set CLOUDFRONT_DISTRIBUTION_ID --body "E33TSNW29S4RDQ"
   gh variable set STORYBLOK_SPACE_ID --body "288632938663524"
   ```

4. **Ensure the webhook SSM SecureStrings exist, then wire the GitHub
   secrets** (never echo these values). Both parameters were created
   manually in account `139809104139`; verify first, create only if
   missing (TF references them by name and never manages their values):

   ```sh
   # Verify both exist (each prints the name, or fails with ParameterNotFound):
   AWS_PROFILE=root-admin aws ssm get-parameter \
     --name /agusgonzaleznic-site/webhook/url-token --query Parameter.Name --output text
   AWS_PROFILE=root-admin aws ssm get-parameter \
     --name /agusgonzaleznic-site/webhook/github-pat --query Parameter.Name --output text

   # ONLY if missing — create them:
   AWS_PROFILE=root-admin aws ssm put-parameter \
     --name /agusgonzaleznic-site/webhook/url-token \
     --type SecureString --value "$(openssl rand -hex 32)"
   # github-pat: fine-grained PAT scoped to this repo with Actions read+write
   # (the Lambda POSTs to the deploy.yml workflow-dispatch endpoint).
   AWS_PROFILE=root-admin aws ssm put-parameter \
     --name /agusgonzaleznic-site/webhook/github-pat \
     --type SecureString --value "<paste PAT, do not echo>"
   ```

   Then wire the secrets:

   ```sh
   op run --env-file ~/.env --no-masking -- bash -c \
     'gh secret set STORYBLOK_MANAGEMENT_TOKEN --body "$STORYBLOK_MANAGEMENT_TOKEN"'

   gh secret set STORYBLOK_WEBHOOK_URL_TOKEN --body "$(AWS_PROFILE=root-admin \
     aws ssm get-parameter --name /agusgonzaleznic-site/webhook/url-token \
     --with-decryption --query Parameter.Value --output text)"
   ```

5. **Create the gated environment** `terraform-production` with yourself as
   required reviewer (this is what turns the apply job into an approval
   gate):

   ```sh
   gh api -X PUT \
     repos/agusgonzaleznic/agusgonzaleznic.github.io/environments/terraform-production \
     --input - <<EOF
   {"reviewers":[{"type":"User","id":$(gh api user --jq .id)}]}
   EOF
   ```

6. **Initialize the site module against the S3 backend.** There is no local
   state to migrate — the live resources will be *imported* into the fresh
   remote state:

   ```sh
   cd ../   # terraform/
   # ensure the backend "s3" block in backend.tf is active
   AWS_PROFILE=root-admin terraform init
   ```

7. **Run the imports** (see execution order below), then verify.
   `var.token` and `var.storyblok_webhook_url_token` have no defaults, so
   plan must run under `op` (otherwise it drops into interactive prompts
   and the Storyblok imports fail):

   ```sh
   op run --env-file ~/.env --no-masking -- bash -c \
     'AWS_PROFILE=root-admin \
      TF_VAR_token=$STORYBLOK_MANAGEMENT_TOKEN \
      TF_VAR_storyblok_webhook_url_token=$STORYBLOK_WEBHOOK_URL_TOKEN \
      terraform plan'
   ```

   Expected residual diff on the very first apply:
   - `module.acm.aws_acm_certificate_validation.this[0]` is **created**
     (not importable in provider v5); it completes instantly because the
     cert is already ISSUED.
   - Any imported Storyblok components show an in-place update filling
     `name`/`space_id` (provider import quirk). No destroy/create should
     ever appear — if one does, STOP and fix the config.

8. **Hand over to CI**: commit, open a PR touching `terraform/**`, check the
   sticky plan comment shows no unexpected changes, merge, and approve the
   `terraform-production` gate for the first CI apply.

## Import execution order (disaster recovery)

All live resources were imported into the S3 remote state on 2026-07-05, so
`imports.tf` was removed (import blocks are one-time; once state is populated
they are inert no-ops). This section is the recovery record: if the remote
state is ever lost, recreate `imports.tf` with these `import` blocks (address →
live ID) and re-run in this order — later resources reference earlier ones.
The S3 state bucket is versioned + `prevent_destroy`, so state loss should not
recur; this is the backstop of last resort.

1. Route53 hosted zone `agusgonzaleznic.com` (`Z01244412JIHKLB4766PS`).
2. The 12 managed Route53 records (apex A/AAAA/MX/TXT/CAA, `www` CNAME,
   DMARC/DKIM/MTA-STS/TLS-RPT records). **Never** the manually-managed
   subdomain records, NS/SOA, or the ACM validation CNAME (next step owns it).
3. ACM certificate (`arn:...:certificate/5252733a-e6e7-4161-bf9e-83b791bb885a`)
   plus its validation CNAME record; `aws_acm_certificate_validation` cannot
   be imported — first apply creates it.
4. CloudFront: response headers policy
   (`a21003ee-2c03-4474-b6d9-23c6fe505af7`), function
   (`agusgonzaleznic-com-www-redirect`, imports the LIVE stage), then the
   distribution (`E33TSNW29S4RDQ`).
5. S3 `agusgonzaleznic.com`: bucket, website config, SSE config, CORS,
   policy, public access block (all import by bucket name). Note: a
   spurious SSE diff may appear because AWS now returns
   `BlockedEncryptionTypes` which provider 5.100.0 does not know.
6. S3 `www.agusgonzaleznic.com`: bucket, website config, SSE config, public
   access block.
7. Storyblok webhook(s), once defined: import ID format is
   `<SPACE_ID>/<WEBHOOK_ID>` (webhook import is clean; component import has
   known quirks — see step 7 of the runbook).

The vestigial OAI `E3LG1Y2B7NO5P2` is not a resource in this config and is
not attached to the distribution — do not import it.

## Day-2 workflow

1. Branch, edit `terraform/**`, open a PR.
2. CI (`terraform.yml`, plan job): fmt-check → init → validate → plan, and
   posts/refreshes a **sticky plan comment** on the PR. No credentials with
   write scope are involved; the OIDC subject is `...:pull_request`.
3. Review the plan comment, merge.
4. Push to `main` triggers the apply job, which waits on the
   `terraform-production` environment gate. Approve it in the Actions UI.
5. The job re-plans (`-out=tfplan`), publishes the plan to the job summary,
   and applies **that exact plan file** in the same job.
6. Manual re-run: `gh workflow run terraform.yml` (still gated by the
   environment approval).

Runs are serialized by the `terraform-state` concurrency group and the S3
native lockfile (`-lock-timeout=60s`); an in-flight apply is never
cancelled.

Bootstrap changes (state bucket, OIDC role/trust) stay human-applied:
`AWS_PROFILE=root-admin terraform apply` inside `terraform/bootstrap/`.

## Known CLI-managed drift

- Lambda resource-policy statement `UrlPolicyInvokeFunction` on
  `agusgonzaleznic-storyblok-rebuild` (`lambda:InvokeFunction`, principal `*`,
  condition `lambda:InvokedViaFunctionUrl=true`). Required since October 2025
  for ALL function URLs; aws provider 5.100.0 cannot express it (no
  `invoked_via_function_url` argument). See the comment in `webhook.tf` for
  the exact re-apply command. Invisible to plans; re-run after any
  destroy/recreate of the function.

## Contact form + Turnstile activation

The contact backend (`contact.tf`, `cdn.tf`) needs these secrets/variables
before the CI apply can run. The three SSM SecureStrings under
`/agusgonzaleznic-site/contact/*` are **Terraform-managed** (values come from
the Cloudflare widget resource, `var.apps_script_url`, and
`var.apps_script_shared_secret`) — do NOT create them by hand, unlike the
webhook params.

**SECURITY — the Apps Script URL is not a secret.** The `/exec` URL was
historically inlined into the public client bundle (old
`VITE_GOOGLE_APPS_SCRIPT_URL`), so it lives in git history, CDN caches, and
users' browsers. The Lambda's 10 controls are worthless if an attacker can POST
straight to that URL. Two things make the endpoint unreachable without the
Lambda, and BOTH are required:

- **Rotate the deployment**: in the Apps Script editor, deploy a brand-new Web
  App version so a fresh `/exec` URL (new deployment id) is minted, and delete
  the old deployment so the previously-public URL is dead. Put the new URL in
  the dedicated `CONTACT_APPS_SCRIPT_URL` GitHub secret (NOT the old VITE one).
- **Gate on a shared secret**: `doPost(e)` must read
  `JSON.parse(e.postData.contents).secret` and `return` early (no email) on any
  mismatch. It must be a body FIELD, not a header — Apps Script's `doPost`
  cannot read arbitrary request headers. The Lambda injects this field from the
  SSM param; set the same value in the `CONTACT_APPS_SCRIPT_SHARED_SECRET`
  GitHub secret and inside the Apps Script.
- After deploying, confirm a direct `curl -X POST` to the `/exec` URL WITHOUT
  the secret does not send mail (and that the deployment's execute access is not
  broader than intended).

1. **Re-apply bootstrap** (human, `root-admin`) so the deploy role gains the
   new DynamoDB / CloudFront-OAC / contact-SSM grants and the lambda-exec
   boundary allows the table. The CI apply fails `AccessDenied` without this:

   ```sh
   cd terraform/bootstrap && AWS_PROFILE=root-admin terraform apply
   ```

2. **Create the Cloudflare API token** (Account > Turnstile > Edit) and wire
   the CI secrets/variables (values never echoed):

   ```sh
   gh secret set CLOUDFLARE_API_TOKEN            # scoped Turnstile:Edit token
   gh variable set CLOUDFLARE_ACCOUNT_ID --body "<cloudflare account id>"
   gh secret set CONTACT_APPS_SCRIPT_URL         # freshly-rotated /exec URL
   gh secret set CONTACT_APPS_SCRIPT_SHARED_SECRET   # e.g. openssl rand -hex 32
   ```

3. **Run the site apply** (`terraform.yml` / merge to main). It creates the
   widget, the three SSM params, the DynamoDB table, the Lambda + Function URL,
   the OAC, and the `/api/*` CloudFront behavior.

4. **Publish the public sitekey** so the client renders the widget. This is a
   deliberate **two-step bootstrap**: the sitekey does not exist until the first
   apply mints the widget, so on a clean first deploy the frontend builds with
   an empty sitekey (the form shows its graceful "temporarily unavailable"
   state). After the first apply, set the variable and RE-RUN the deploy
   workflow so the sitekey is inlined:

   ```sh
   gh variable set TURNSTILE_SITE_KEY \
     --body "$(terraform -chdir=terraform output -raw turnstile_sitekey)"
   gh workflow run deploy.yml   # rebuild the client with the sitekey present
   ```

   Unset → the widget is absent and the form shows a graceful
   "temporarily unavailable" state.

Recommended further hardening (not yet applied): an AWS WAF rate-based rule on
the `/api/*` CloudFront behavior. The Lambda now throttles per-IP and with a
global burst counter BEFORE the outbound Turnstile siteverify call, but a WAF
rate rule at the edge is the strongest defense against a distributed flood
saturating the account's low Lambda concurrency.
