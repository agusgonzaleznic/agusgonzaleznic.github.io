# Terraform: agusgonzaleznic.com

Infrastructure for the site: Route53, ACM, CloudFront (distribution, function,
OAC, origin-request + response-headers policies), S3, SESv2 (identity, DKIM,
custom MAIL FROM), the contact + webhook Lambdas with their exec roles, DynamoDB
(rate limits), SSM, and the Cloudflare Turnstile widget (AWS account
`139809104139`, `us-east-1`) plus Storyblok resources: component schemas and
the rebuild webhook (space `288632938663524`, EU / `mapi.storyblok.com`).

## Architecture

Two root modules with a strict trust boundary:

| Module | Path | State | Who applies |
|---|---|---|---|
| **bootstrap** | `terraform/bootstrap/` | S3 (self-migrated, see runbook) | **CI**, gated on the `terraform-bootstrap` environment. `AWS_PROFILE=root-admin` is break-glass only |
| **site** | `terraform/` | S3 backend, `use_lockfile = true` (native S3 locking, no DynamoDB) | **CI only** (`.github/workflows/terraform.yml`) via GitHub OIDC |

- `bootstrap/` owns the chicken-and-egg pieces: the S3 state bucket, the
  GitHub OIDC identity provider, and every IAM role/policy CI assumes,
  including the deploy role's permission surface and the Lambda execution
  boundary. It runs in CI through its OWN roles (`github-terraform-bootstrap`
  for the gated apply, `github-terraform-bootstrap-plan`, read-only, for plans),
  never through the site deploy role: the site jobs still carry a guard step
  that fails if they ever target `bootstrap/`. See `bootstrap/README.md` for
  why the two tiers cannot collapse into one apply.
- The site module owns everything else: DNS zone + records, ACM cert,
  CloudFront distribution / function / response-headers policy, S3 website
  buckets, and Storyblok webhook resources.
- Plans and applies use SEPARATE roles, so a PR never holds write credentials:
  - `github-terraform-plan` trusts only
    `repo:agusgonzaleznic/agusgonzaleznic.github.io:pull_request` and is
    read-only (`ReadOnlyAccess`, minus Denies on the channels that return
    secrets or personal data, plus the one `kms:Decrypt` a SecureString refresh
    needs).
  - `github-terraform-deploy` trusts only
    `repo:agusgonzaleznic/agusgonzaleznic.github.io:environment:terraform-production`
    (the environment name replaces the ref in the subject). Because declaring an
    environment mints that subject for ANY event, the environment is also pinned
    to the `main` branch, otherwise branch code could mint it.

Deliberately **not** managed here:

- A manually-managed subdomain's A/AAAA records (a personal-network endpoint,
  out of Terraform scope). Never import or define them.
- SSM SecureStrings `/agusgonzaleznic-site/webhook/github-pat` and
  `/agusgonzaleznic-site/webhook/url-token`: referenced by name only; their
  values are never data-read into state. Rotating the url-token means:
  update the SSM parameter, update the `STORYBLOK_WEBHOOK_URL_TOKEN` repo
  secret, and re-apply so the Storyblok webhook endpoint is rewritten.
- Storyblok stories/content (blog folder, draft posts): the labd/storyblok
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

   This creates the state bucket, the GitHub OIDC provider, and all four CI
   IAM roles (`github-terraform-deploy`, `github-cdn-invalidation`,
   `github-terraform-bootstrap`, `github-terraform-bootstrap-plan`) plus the
   bootstrap ceiling, the Lambda exec boundary, and the deploy policies.

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
   # still in terraform/bootstrap; output name per bootstrap/outputs.tf
   gh variable set AWS_TF_ROLE_ARN \
     --body "$(AWS_PROFILE=root-admin terraform output -raw deploy_role_arn)"
   gh variable set AWS_TF_PLAN_ROLE_ARN \
     --body "$(AWS_PROFILE=root-admin terraform output -raw site_plan_role_arn)"
   gh variable set AWS_CDN_ROLE_ARN \
     --body "$(AWS_PROFILE=root-admin terraform output -raw cdn_invalidation_role_arn)"
   # NOTE: github-cdn-invalidation is deliberately also assumable by
   # agusgonzaleznic/drive-berlin:main (the proxied /drive-berlin/ app must
   # invalidate the shared distribution). Blast radius: invalidations only.
   gh variable set CLOUDFRONT_DISTRIBUTION_ID --body "E33TSNW29S4RDQ"
   gh variable set STORYBLOK_SPACE_ID --body "288632938663524"
   ```

   Then hand the bootstrap tier itself over to CI. Create the environment
   **with its required reviewer first**, because an existing environment with
   no reviewer would auto-apply IAM:

   ```sh
   gh api -X PUT repos/agusgonzaleznic/agusgonzaleznic.github.io/environments/terraform-bootstrap \
     -f 'reviewers[][type]=User' -F "reviewers[][id]=$(gh api user --jq .id)"

   gh variable set AWS_TF_BOOTSTRAP_ROLE_ARN \
     --body "$(AWS_PROFILE=root-admin terraform output -raw bootstrap_role_arn)"
   gh variable set AWS_TF_BOOTSTRAP_PLAN_ROLE_ARN \
     --body "$(AWS_PROFILE=root-admin terraform output -raw bootstrap_plan_role_arn)"
   ```

   Until both `AWS_TF_BOOTSTRAP_*` variables are set the bootstrap CI jobs skip
   rather than fail, so this step is what switches them on.

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

   # ONLY if missing, create them:
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
   state to migrate; the live resources will be *imported* into the fresh
   remote state:

   ```sh
   cd ../   # terraform/
   # ensure the backend "s3" block in backend.tf is active
   AWS_PROFILE=root-admin terraform init
   ```

7. **Run the imports** (see execution order below), then verify.
   `var.token`, `var.storyblok_webhook_url_token`, `var.cloudflare_api_token`
   and `var.cloudflare_account_id` have no defaults, so plan must run under
   `op` (otherwise it drops into interactive prompts and the Storyblok imports
   fail):

   ```sh
   op run --env-file ~/.env --no-masking -- bash -c \
     'AWS_PROFILE=root-admin \
      TF_VAR_token=$STORYBLOK_MANAGEMENT_TOKEN \
      TF_VAR_storyblok_webhook_url_token=$STORYBLOK_WEBHOOK_URL_TOKEN \
      TF_VAR_cloudflare_api_token=$CLOUDFLARE_API_TOKEN \
      TF_VAR_cloudflare_account_id=$CLOUDFLARE_ACCOUNT_ID \
      terraform plan'
   ```

   Local Terraform must be `>= 1.14` (both modules require it; CI pins
   `1.14.*`, and `use_lockfile` state locking needs a modern binary).

   Expected residual diff on the very first apply:
   - `module.acm.aws_acm_certificate_validation.this[0]` is **created**
     (not importable in provider v5); it completes instantly because the
     cert is already ISSUED.
   - Any imported Storyblok components show an in-place update filling
     `name`/`space_id` (provider import quirk). No destroy/create should
     ever appear; if one does, STOP and fix the config.

8. **Hand over to CI**: commit, open a PR touching `terraform/**`, check the
   sticky plan comment shows no unexpected changes, merge, and approve the
   `terraform-production` gate for the first CI apply.

## Import execution order (disaster recovery)

All live resources were imported into the S3 remote state on 2026-07-05, so
`imports.tf` was removed (import blocks are one-time; once state is populated
they are inert no-ops). This section is the recovery record: if the remote
state is ever lost, recreate `imports.tf` with these `import` blocks (address →
live ID) and re-run in this order: later resources reference earlier ones.
The S3 state bucket is versioned + `prevent_destroy`, so state loss should not
recur; this is the backstop of last resort.

1. Route53 hosted zone `agusgonzaleznic.com` (`Z01244412JIHKLB4766PS`).
2. The 14 managed Route53 records (apex A/AAAA/MX/TXT/CAA, `www` CNAME,
   DMARC/DKIM/MTA-STS/TLS-RPT, and the SES MAIL-FROM `mail` MX + TXT). **Never**
   the manually-managed subdomain records, NS/SOA, the 3 SES DKIM CNAMEs
   (standalone `aws_route53_record.ses_dkim` resources; import those under
   their own addresses), or the ACM validation CNAME (next step owns it).

   > **This list predates the contact/SES stack.** A full recovery today must
   > also import: the SESv2 domain identity + MAIL-FROM attributes and the 3
   > DKIM CNAMEs (`ses.tf`), the Turnstile widget, the TF-managed contact SSM
   > SecureString, the DynamoDB table, both Lambdas + function URLs +
   > permissions + exec roles, the OAC, the custom origin-request policy, and
   > the `immutable_assets` response-headers policy (`contact.tf`, `cdn.tf`,
   > `webhook.tf`). All have fixed names, so an un-imported apply collides with
   > the live resources rather than silently duplicating them.
3. ACM certificate (`arn:...:certificate/5252733a-e6e7-4161-bf9e-83b791bb885a`)
   plus its validation CNAME record; `aws_acm_certificate_validation` cannot
   be imported; first apply creates it.
4. CloudFront: response headers policy
   (`a21003ee-2c03-4474-b6d9-23c6fe505af7`), function
   (`agusgonzaleznic-com-www-redirect`, imports the LIVE stage), then the
   distribution (`E33TSNW29S4RDQ`).
5. S3 `agusgonzaleznic.com`: bucket, website config, SSE config, CORS,
   public access block (all import by bucket name). Note: a
   spurious SSE diff may appear because AWS now returns
   `BlockedEncryptionTypes` which provider 5.100.0 does not know. There is
   **no bucket policy** to import any more: `s3.tf` no longer attaches one
   (see the OAI note below), which is what took this step off the OAI
   dependency.
6. S3 `www.agusgonzaleznic.com`: bucket, website config, SSE config, public
   access block.
7. Storyblok webhook(s), once defined: import ID format is
   `<SPACE_ID>/<WEBHOOK_ID>` (webhook import is clean; component import has
   known quirks: see step 7 of the runbook).

The vestigial OAI `E3LG1Y2B7NO5P2` is not a resource in this config and is
not attached to the distribution. Do not import it. It is no longer referenced
by any resource either: it used to be the sole principal of the TF-managed
apex bucket policy, and that policy was deleted from `s3.tf` because OAI ids
are AWS-assigned. Had anyone tidied up the unused OAI, no Terraform run could
have recreated `E3LG1Y2B7NO5P2`, and this recovery would have stopped at
step 5 with `MalformedPolicy: Invalid principal in policy` on a resource that
serves no traffic: nothing reads either S3 bucket, since `cdn.tf`'s only
origins are `github-pages` and `contact-lambda`. Deleting the OAI in AWS is
now a no-op for Terraform.

## Day-2 workflow

1. Branch, edit `terraform/**`, open a PR.

   **Markdown-only changes under `terraform/` do not trigger this workflow at
   all**: no plan comment, no `Tier split`, no gated apply. That is deliberate:
   a README edit cannot change infrastructure, and queuing an approval request
   for an apply that provably does nothing is how a gate stops being read. If
   you edited a `.md` here and see no terraform checks, nothing is broken.

   Note this makes `terraform/README.md` the one file that can drift from the
   code it documents without CI noticing, since no plan runs to contradict it.
   Re-read it when you change the thing it describes.
2. CI (`terraform.yml`, plan job): fmt-check → init → validate → plan, and
   posts/refreshes a **sticky plan comment** on the PR. The site plan assumes
   `github-terraform-plan`, which is read-only and is the only role a PR job can
   assume in either tier; an `aws sts get-caller-identity` step asserts that
   in-workflow, because a credentials failure aborts before the plan step and
   would otherwise leave the previous commit's green comment on the PR.
   **Every** terraform PR additionally runs
   `Bootstrap plan (PR)`: the job is gated on the `AWS_TF_BOOTSTRAP_PLAN_ROLE_ARN`
   variable, not on paths, so it surfaces bootstrap drift on site-only PRs too.
   Its output lands in the **job summary**, not the sticky comment (`-lock=false` by design: the plan role holds no
   `s3:PutObject`, so it cannot take the state lock). If the plan-scrub step
   redacts secret-shaped content, the job goes red *after* posting the
   redacted comment; that means "investigate before merging", not "retry".
3. Review the plan comment, merge.
4. Push to `main` triggers the apply job, which waits on the
   `terraform-production` environment gate. Approve it in the Actions UI.
   (If the *bootstrap* tier has changes, a `terraform-bootstrap` approval is
   requested first. Pure drift counts, because detection is by plan, not by
   paths.) Manual re-runs: `workflow_dispatch` only does anything
   from `main`; on any other ref every job skips silently. `TF_CLI_ARGS*`
   overrides are refused by a guard step in every job.
5. The job re-plans (`-out=tfplan`), publishes the plan to the job summary,
   and applies **that exact plan file** in the same job.
6. Manual re-run: `gh workflow run terraform.yml` (still gated by the
   environment approval).

Runs are serialized by the `terraform-state` concurrency group and the S3
native lockfile (`-lock-timeout=60s`); an in-flight apply is never
cancelled.

Bootstrap changes ride the same PR as the site change that needs them. On
merge, `bootstrap-detect` re-plans read-only and publishes the diff, then
`bootstrap-apply` (gated on `terraform-bootstrap`) applies it **before** the
site apply: the ordering matters, because it is what grants the deploy role the
permissions the site plan is about to use. `bootstrap-apply` is skipped when that
module has no changes, so routine merges still need exactly one approval.

## Known CLI-managed drift

- Lambda resource-policy statement `UrlPolicyInvokeFunction` on
  `agusgonzaleznic-storyblok-rebuild` (`lambda:InvokeFunction`, principal `*`,
  condition `lambda:InvokedViaFunctionUrl=true`). Required since October 2025
  for ALL function URLs; aws provider 5.100.0 cannot express it (no
  `invoked_via_function_url` argument). See the comment in `webhook.tf` for
  the exact re-apply command. Invisible to plans; re-run after any
  destroy/recreate of the function.

## Contact form + Turnstile activation

**This activation is complete and live** (secrets, variables, grants and the
apply all shipped 2026-07/08). This section remains as the re-activation /
disaster-recovery runbook. The contact backend (`contact.tf`, `ses.tf`,
`cdn.tf`) needs these secrets/variables before the CI apply can run. The ONE SSM SecureString under
`/agusgonzaleznic-site/contact/*` is **Terraform-managed** (value comes from the
Cloudflare widget resource). Do NOT create it by hand, unlike the webhook
params.

**Mail delivery is SES, not Apps Script.** The Lambda calls `ses:SendEmail`
itself. There is no `/exec` URL and no shared secret any more: the previous
design hung on an Apps Script deployment id that Terraform could not derive, so
it had to be hand-copied into SSM, and two live deployments on different code
versions silently diverged (one kept running the old sender while the other was
being edited). Nothing in this path is hand-fed now.

**DMARC is `p=reject`, so DKIM is load-bearing.** Unsigned SES mail from the
default `amazonses.com` envelope aligns on neither SPF nor DKIM and is
REJECTED, not merely spam-filed. `ses.tf` therefore configures both mechanisms:
Easy DKIM, and a custom MAIL FROM (`mail.agusgonzaleznic.com`, MX + SPF records
in `dns.tf`) so SPF aligns too under DMARC's relaxed `aspf`; the apex SPF
stays Google-only on purpose (an apex `include:amazonses.com` would authorize
every SES customer). `ses.tf` creates the
domain identity with Easy DKIM plus its three CNAMEs, and **the identity must
report `Verified` BEFORE the Lambda starts sending**; see the two-stage apply
below. The apex MX stays Google Workspace and is untouched.

**SES sandbox is fine and permanent here.** The sandbox restricts RECIPIENTS to
verified identities, and a verified DOMAIN identity covers every address on it,
so notifying `me@agusgonzaleznic.com` needs no production-access request. If you
ever want to CC the submitter, that is a different domain and DOES require
production access.

1. **Widen bootstrap in ITS OWN PR, merged and applied FIRST.** The deploy role
   needs the new SES grants and, critically, the lambda-exec boundary must
   allow `ses:SendEmail`. The boundary is the ceiling: without it the site apply
   SUCCEEDS and the function is denied at RUNTIME. The CI apply fails
   `AccessDenied` on `CreateEmailIdentity` without the deploy policy, and even
   `terraform plan` fails without `ses:GetEmailIdentity` (the DKIM tokens are
   read on every plan).

   **NEVER put the bootstrap grant and the site resource that consumes it in the
   same PR.** An earlier version of this file said to do exactly that and called
   the resulting red site plan "expected". It is not acceptable: the site plan
   is the only evidence that the change does what it claims, and a PR merged
   with a red plan is merged unverified.

   The cost of getting this wrong is not theoretical. Five PRs were merged with
   that plan red, and a genuine bug hid behind the normalised redness the whole
   time: `bootstrap-apply` was silently skipping on every commit (a `tee` in the
   detect step swallowed terraform's `-detailed-exitcode`), so none of that
   terraform was ever applied. A green-plan rule would have caught it on the
   first PR.

   So: PR 1 touches `terraform/bootstrap/` only; its own `Bootstrap plan (PR)`
   is green, because bootstrap grants itself nothing. Merge it, approve
   `terraform-bootstrap`, and the grant lands. PR 2 then carries the site change
   with a GREEN `Plan (PR)`. Two merges, both verified. The `tier-split` CI job
   fails a PR that touches both tiers, so this cannot be forgotten.

2. **Create the Cloudflare API token** (Account > Turnstile > Edit) and wire the
   CI secrets/variables (values never echoed):

   ```sh
   gh secret set CLOUDFLARE_API_TOKEN            # scoped Turnstile:Edit token
   gh variable set CLOUDFLARE_ACCOUNT_ID --body "<cloudflare account id>"
   ```

   The former `CONTACT_APPS_SCRIPT_URL` / `CONTACT_APPS_SCRIPT_SHARED_SECRET`
   secrets were deleted on 2026-08-20 (along with `VITE_GOOGLE_APPS_SCRIPT_URL`
   and `TRANSLATE_PR_TOKEN`, both also dead).

3. **Run the site apply** (`terraform.yml` / merge to main). It creates the
   widget, the Turnstile SSM param, the DynamoDB table, the Lambda + Function
   URL, the OAC, the `/api/*` CloudFront behavior, the SES domain identity and
   its three DKIM CNAMEs.

   **Then wait for DKIM before trusting the form.** SES verifies
   asynchronously (usually minutes once the CNAMEs resolve):

   ```sh
   aws sesv2 get-email-identity --email-identity agusgonzaleznic.com \
     --region us-east-1 \
     --query '{Verified:VerifiedForSendingStatus,Dkim:DkimAttributes.Status}'
   ```

   Both must read `true` / `SUCCESS`. Until then every send fails closed: the
   Lambda returns 502 `{"ok":false,"error":"delivery"}` and logs
   `control:"ses_send"`. On a first-time rollout, apply this BEFORE cutting the
   client over, or accept a short window where submissions error.

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
global burst counter BEFORE the outbound Turnstile siteverify call, but those
run INSIDE an invocation that has already claimed a concurrency slot, so they
bound SES spend and Turnstile calls rather than concurrency. A WAF rate rule at
the edge is the strongest defense against a distributed flood saturating the
account's low Lambda concurrency.

That saturation is not contained to the contact form. Both Lambdas are
unreserved, so they share ONE 10-slot account pool: a flood against `/api/*`
throttles Storyblok's rebuild webhook too, and the post silently never goes
live. **Owner action, requested 2026-08-28 and still open:** a Service Quotas
increase for `L-B99A9384` (AWS Lambda, "Concurrent executions", us-east-1) to
1000. It is `CASE_OPENED`, not granted: the applied value is still 10. AWS
refuses any reservation that leaves less than 100 unreserved, so until the case
closes no per-function reservation can exist. Check the applied value with:

```sh
aws service-quotas get-service-quota \
  --service-code lambda --quota-code L-B99A9384 --region us-east-1
```

Once it reads above 10, isolation is one line: set
`lambda_reserved_concurrency` (`variables.tf`, currently `null`), which applies
to both functions and caps legitimate concurrent contact submissions at the
same number.

### Rotation runbooks

- **`CLOUDFLARE_API_TOKEN`** (deploy-time only): mint a new scoped token in
  Cloudflare, `gh secret set CLOUDFLARE_API_TOKEN`, done; no apply needed.
- **Turnstile secret** (runtime, TF-managed): taint/replace
  `cloudflare_turnstile_widget.contact` so the SSM param re-derives from the new
  widget, apply, then rebuild the client (`deploy.yml`) so the new
  `TURNSTILE_SITE_KEY` ships in the bundle.
- **Webhook url-token**: see the `/agusgonzaleznic-site/webhook/*` bullet under
  "Deliberately not managed here" (Architecture section): SSM param + repo
  secret + re-apply (the Storyblok webhook endpoint embeds the token).
- **Webhook GitHub PAT** (`/agusgonzaleznic-site/webhook/github-pat`, runtime,
  value NOT TF-managed). This one is the rebuild pipeline's single point of
  failure and its expiry is silent, so read the whole bullet before touching it.

  A **fine-grained PAT cannot be non-expiring**: 366 days is GitHub's maximum,
  so "set it to never expire" is not an option and there is no AWS-side control
  that can infer the date. Either diarise the expiry (calendar reminder ~2
  weeks before, and record the date here when you rotate) or replace the PAT
  with a **GitHub App installation token**: an App with `actions: write` on this
  repo only, its private key in SSM, and the Lambda minting a 1-hour
  installation token per invocation. That is the only variant with nothing to
  diarise, and it is the right end state; the PAT is the interim.

  Why it must be diarised: on expiry the dispatch POST returns 401, the Lambda
  logs `{"msg":"dispatch failed","status":401}` and returns 502 to Storyblok,
  but **the invocation itself succeeds**, so the Lambda `Errors` metric stays
  flat and an Errors alarm can never fire. CloudFront and GitHub Pages keep
  serving the last good build with HTTP 200, so the site looks healthy while
  every publish silently never ships.

  To rotate:

  1. Mint the replacement: GitHub > Settings > Developer settings > Personal
     access tokens > Fine-grained tokens. Resource owner `agusgonzaleznic`,
     **Only select repositories** = this repo, permission **Actions: Read and
     write**, nothing else. Set the longest expiry you are willing to diarise.
  2. Prove the new token can dispatch BEFORE storing it (a scope typo returns
     404, not 401, which is easy to misread as "wrong token"):

     ```sh
     read -rs NEW_PAT   # not an argument, not in shell history
     curl -sS -o /dev/null -w '%{http_code}\n' \
       -H "authorization: Bearer $NEW_PAT" \
       -H "accept: application/vnd.github+json" \
       https://api.github.com/repos/agusgonzaleznic/agusgonzaleznic.github.io/actions/workflows/deploy.yml
     # expect 200. 401 = bad/expired token, 404 = repo not selected or
     # Actions permission missing.
     ```

  3. Overwrite the SecureString in place, same name (the Lambda reads it by
     name, so nothing else changes):

     ```sh
     AWS_PROFILE=root-admin aws ssm put-parameter \
       --name /agusgonzaleznic-site/webhook/github-pat \
       --type SecureString --overwrite --value "$NEW_PAT"
     unset NEW_PAT
     ```

  4. **No `terraform apply` is needed**, unlike the url-token: no repo secret
     and no Terraform argument embeds this value. Do not add one.
  5. Wait ~5 minutes before believing a failure: the handler
     (`lambda-src/storyblok-rebuild/index.mjs`) caches SSM parameters for 5
     minutes per warm container, so a warm container keeps using the old PAT
     until that cache expires.
  6. Verify end to end: republish any story in Storyblok and check that
     `deploy.yml` starts (`gh run list --workflow=deploy.yml --limit 3`). A
     manual `gh workflow run deploy.yml` proves nothing here, it uses your
     credentials, not the PAT.
  7. Revoke the old PAT in GitHub, and record the new expiry date.
