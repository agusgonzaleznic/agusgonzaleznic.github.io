################################################################################
# SES — sender identity for the contact form's owner-notification mail.
#
# Replaces the previous Google Apps Script hop. The Apps Script was a web-app
# deployment whose /exec URL is an opaque, non-derivable id: Terraform could
# never own it, it had to be hand-copied into SSM, and two live deployments on
# different code versions silently diverged. SES makes the whole path
# declarative.
#
# DMARC on this domain is p=reject (dns.tf), so DKIM alignment is MANDATORY,
# not cosmetic: unsigned SES mail aligns on neither SPF (amazonses.com) nor
# DKIM and would be REJECTED outright. Hence Easy DKIM below plus its three
# CNAMEs. Google Workspace keeps the apex MX and its own google._domainkey
# selector; SES adds three separate selectors and does not collide.
#
# SANDBOX IS FINE HERE and needs no support request: the sandbox restricts
# RECIPIENTS to verified identities, and a verified DOMAIN identity covers
# every address on it. The only recipient is local.contact_mail_to, which is
# on this domain. Sending to any OTHER domain (e.g. echoing a copy to the
# submitter) would require production access — do not add that without it.
################################################################################

resource "aws_sesv2_email_identity" "main" {
  email_identity = local.domain_name

  # Easy DKIM: SES generates the keypair and publishes 3 CNAME tokens for us to
  # serve. 2048-bit is the current SES default for Easy DKIM.
  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }

  tags = local.tags
}

# Easy DKIM always returns exactly THREE tokens, so `count` is a static 3 even
# though the token VALUES are unknown until apply. This is why these are
# standalone records instead of entries in module.route53_records' `records`
# list: that module for_each's over the list, and a for_each whose KEYS derive
# from unknown-at-plan values fails with "value depends on resource attributes
# that cannot be determined until apply". Records created outside that list are
# already established practice here — the ACM module publishes its own
# validation records the same way (acm.tf).
resource "aws_route53_record" "ses_dkim" {
  count = 3

  zone_id = module.route53.route53_zone_zone_id[local.domain_name]
  name    = "${aws_sesv2_email_identity.main.dkim_signing_attributes[0].tokens[count.index]}._domainkey.${local.domain_name}"
  type    = "CNAME"
  ttl     = 300
  records = ["${aws_sesv2_email_identity.main.dkim_signing_attributes[0].tokens[count.index]}.dkim.amazonses.com"]
}

output "ses_dkim_verification_note" {
  description = "How to confirm the SES identity is usable before the Lambda depends on it."
  value       = "aws sesv2 get-email-identity --email-identity ${local.domain_name} --region ${var.aws_region} --query '{Verified:VerifiedForSendingStatus,Dkim:DkimAttributes.Status}'"
}
