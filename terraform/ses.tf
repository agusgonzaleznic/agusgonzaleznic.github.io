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

# Custom MAIL FROM: makes the SMTP envelope domain mail.agusgonzaleznic.com
# instead of amazonses.com, so SPF ALIGNS (relaxed) in addition to DKIM. DMARC
# then passes on both mechanisms rather than resting on DKIM alone. Its MX + SPF
# records are in dns.tf, scoped to that subdomain only.
#
# behavior_on_mx_failure = USE_DEFAULT_VALUE, deliberately: if the MX ever stops
# resolving, SES falls back to amazonses.com and mail STILL SENDS (DKIM keeps
# DMARC passing). REJECT_MESSAGE would instead silently kill the contact form on
# a DNS glitch - the exact failure mode this whole migration existed to remove.
resource "aws_sesv2_email_identity_mail_from_attributes" "main" {
  email_identity         = aws_sesv2_email_identity.main.email_identity
  mail_from_domain       = "mail.${local.domain_name}"
  behavior_on_mx_failure = "USE_DEFAULT_VALUE"
}

output "ses_dkim_verification_note" {
  description = "How to confirm the SES identity is usable before the Lambda depends on it."
  value       = "aws sesv2 get-email-identity --email-identity ${local.domain_name} --region ${var.aws_region} --query '{Verified:VerifiedForSendingStatus,Dkim:DkimAttributes.Status}'"
}

################################################################################
# Configuration set — so a bounce or a complaint is visible.
#
# Without one, SES tells us nothing after the API call returns. SendEmail
# succeeding means SES ACCEPTED the message, not that anyone received it: a hard
# bounce or a spam complaint happens minutes later, out of band, and the Lambda
# has already logged ses_send ok and returned 200. The site has already paid once
# for a contact path that reported success while the mail never arrived.
#
# The event destination is CloudWatch rather than SNS deliberately. SES publishes
# the metrics itself, so there is no topic policy to widen and no cross-service
# trust to add, and the result plugs into the alarm pattern observability.tf
# already uses. An SNS destination would need SetTopicAttributes on the alerts
# topic and a ses.amazonaws.com principal in its policy — more surface for the
# same signal.
#
# ORDERING: the lambda-exec boundary already allows ses:SendEmail on this set's
# ARN (bootstrap, applied separately). IAM accepts an ARN for a resource that
# does not exist yet, which is what let that grant land first — the reverse order
# cannot work, because the site plan would run before the grant existed.
################################################################################

resource "aws_sesv2_configuration_set" "contact" {
  configuration_set_name = "agusgonzaleznic-contact"

  delivery_options {
    # Refuse to deliver over an unencrypted connection. The only recipient is on
    # this domain (Google Workspace), which supports TLS, so REQUIRE costs
    # nothing here and turns a silent downgrade into a visible failure.
    tls_policy = "REQUIRE"
  }

  reputation_options {
    # Per-configuration-set bounce/complaint tracking. This is what makes the
    # metrics below scoped to the contact form instead of account-wide.
    reputation_metrics_enabled = true
  }

  sending_options {
    sending_enabled = true
  }

  suppression_options {
    # Account-level suppression list: stop sending to addresses that have already
    # hard-bounced or complained. Only relevant for the reply-to path, but it
    # protects the domain's reputation, which is shared with Google Workspace mail.
    suppressed_reasons = ["BOUNCE", "COMPLAINT"]
  }

  tags = local.tags
}

resource "aws_sesv2_configuration_set_event_destination" "contact_cloudwatch" {
  configuration_set_name = aws_sesv2_configuration_set.contact.configuration_set_name
  event_destination_name = "cloudwatch"

  event_destination {
    enabled = true
    # REJECT and RENDERING_FAILURE are synchronous-ish; BOUNCE, COMPLAINT and
    # DELIVERY_DELAY are the ones that only exist after the API call returned OK,
    # and are the whole reason this resource exists. SEND and DELIVERY give the
    # denominator, without which a bounce count cannot be read as a rate.
    matching_event_types = [
      "SEND",
      "DELIVERY",
      "BOUNCE",
      "COMPLAINT",
      "REJECT",
      "DELIVERY_DELAY",
      "RENDERING_FAILURE",
    ]

    cloud_watch_destination {
      dimension_configuration {
        # MESSAGE_TAG with a constant default: every event lands under one
        # dimension value, which is what the alarms below can actually match. Per
        # message tags would fragment the metric across dimension values and the
        # alarms would silently watch an empty series.
        dimension_name          = "ses:configuration-set"
        dimension_value_source  = "MESSAGE_TAG"
        default_dimension_value = "agusgonzaleznic-contact"
      }
    }
  }
}
