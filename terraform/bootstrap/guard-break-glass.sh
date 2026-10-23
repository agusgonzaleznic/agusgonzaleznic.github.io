#!/usr/bin/env bash
# Fail a bootstrap plan that contains a change agusgonzaleznic-bootstrap-ceiling
# denies to CI (role-bootstrap-ci.tf): creating or replacing a role, editing a
# trust policy or permissions boundary, the bootstrap role's own grants, the
# state bucket policy, ACL, ownership or replication, or the ceiling itself.
# Without this the reviewer approves an apply that dies half-way on an explicit
# deny. Run by bootstrap-plan and bootstrap-detect in terraform.yml, on the
# plan.txt their plan step wrote.
#
# Usage: guard-break-glass.sh <plan.txt>
set -euo pipefail

plan="$1"
work="$(mktemp -d)"
actions="$work/actions.txt"
hits="$work/hits.txt"

# Only the planned actions count: drift notes above the marker say what
# changed outside Terraform, not what CI would call.
sed -n '/^Terraform will perform the following actions:/,$p' "$plan" > "$actions"

# A plan that lists changes without the marker is one this guard cannot read
# (a Terraform wording change, say), so refuse rather than pass it.
if [ ! -s "$actions" ] && grep -qE '^Plan: [0-9]+ to add, [0-9]+ to change, [0-9]+ to destroy' "$plan"; then
  echo "::error title=Break-glass guard cannot read the plan::The plan lists changes but the 'Terraform will perform the following actions:' marker was not found."
  exit 1
fi

# Headers carry the full address, module path included, e.g.
#   # aws_iam_role.site_plan will be created
#   # module.x.aws_iam_role.this[0] is tainted, so must be replaced
# Destroying a role is allowed (DeleteRole); creating or replacing one is not.
# The literal dot after aws_iam_role keeps aws_iam_role_policy* out.
grep -nE \
  -e '^[[:space:]]*# ([^ ]*\.)?aws_iam_role\.[^ ]+ .*(will be created|must be replaced|will be replaced)' \
  -e '^[[:space:]]*# ([^ ]*\.)?aws_iam_policy\.bootstrap_ceiling(\[[^]]*\])?[[:space:]]' \
  -e '^[[:space:]]*# ([^ ]*\.)?aws_iam_role_policy\.bootstrap_write_state(\[[^]]*\])?[[:space:]]' \
  -e '^[[:space:]]*# ([^ ]*\.)?aws_iam_role_policy_attachment\.bootstrap_write_iam(\[[^]]*\])?[[:space:]]' \
  -e '^[[:space:]]*# ([^ ]*\.)?aws_s3_bucket_policy\.terraform_state(\[[^]]*\])?[[:space:]]' \
  -e '^[[:space:]]*# ([^ ]*\.)?aws_s3_bucket_(acl|ownership_controls|replication_configuration)\.' \
  "$actions" > "$hits" || true

# Trust and boundary edits on an existing role are in-place updates, so look
# inside "updated in-place" blocks only (a destroy block also lists
# assume_role_policy, and destroying is allowed). Every header resets the
# block, the tainted form included.
awk '
  /^[[:space:]]*# [^ ]+ .*(will be|must be)/ { addr = $2; upd = ($0 ~ /will be updated in-place/) }
  upd && /^[[:space:]]*[~+-][[:space:]]+(assume_role_policy|permissions_boundary)[[:space:]]*=/ { print NR ": " addr ": " $0 }
' "$actions" >> "$hits"

if [ -s "$hits" ]; then
  cat "$hits"
  echo "::error title=Break-glass change::This plan creates or replaces a role, edits a trust policy or permissions boundary, changes the bootstrap role's own grants, the state bucket's policy, ACL, ownership or replication, or the ceiling. agusgonzaleznic-bootstrap-ceiling denies those to CI, so the gated apply would fail half-way. Apply this commit locally with AWS_PROFILE=root-admin after reading the plan, then re-run the checks (terraform/bootstrap/README.md, Break-glass)."
  exit 1
fi
echo "OK: nothing in this plan needs the break-glass apply."
