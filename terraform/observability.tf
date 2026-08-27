################################################################################
# Observability — the fix for SILENT failure.
#
# WHY THIS FILE EXISTS
#
# Every failure path in the contact Lambda is caught and returned as a normal
# HTTP response (502 {"error":"delivery"} / 429), which is correct for the
# caller but means the AWS/Lambda `Errors` metric stays at ZERO no matter how
# broken the form is. Before this file there was no alarm, no SNS topic, no
# budget and no log retention anywhere in either tier — so the site's only
# lead-capture path could be completely dead and nothing would say so. That is
# not hypothetical here: a contact-form failure that produced no signal already
# cost the owner a collaboration opportunity.
#
# The alarms therefore watch the LOG CONTRACT, not the platform error metric.
# See the note above bumpCounter in contact-lambda-src/index.mjs: `status` is
# the stable alarm key and must not be repurposed.
################################################################################

locals {
  contact_log_group_name = "/aws/lambda/${local.contact_function_name}"
  webhook_log_group_name = "/aws/lambda/${local.webhook_function_name}"

  # Must stay under the agusgonzaleznic-* prefix: every bootstrap ceiling that
  # lets CI manage a function, its role and its log group is scoped to it.
  alert_relay_function_name = "agusgonzaleznic-alert-relay"

  # Same prefix contract, and it is not yet backed by anything: no ceiling in
  # terraform/bootstrap/ mentions SQS at all, so the grant this queue needs has
  # to be written from scratch and scoped to
  # arn:aws:sqs:us-east-1:<account>:agusgonzaleznic-*.
  alert_relay_dlq_name = "${local.alert_relay_function_name}-dlq"
}

# ---- Log groups -------------------------------------------------------------
# Lambda creates these implicitly on first invocation with retention "Never
# expire". Two problems: unbounded ingest cost on a PUBLIC endpoint, and the
# contact log records the submitter's IP address, so "never expire" means
# indefinite retention of personal data — which the privacy notice now says is
# kept only as long as needed. 30 days is the shortest window that still allows
# diagnosing a report that arrives a few weeks late.
#
# `import` blocks (Terraform >= 1.5, and 1.14 is pinned in CI) rather than a
# manual `terraform import`: applies only ever run in CI under OIDC, so there is
# no sanctioned path for a local state write. If a group does not exist the plan
# fails loudly in CI before any apply, which is the safe direction.
import {
  to = aws_cloudwatch_log_group.contact
  id = "/aws/lambda/agusgonzaleznic-contact"
}

import {
  to = aws_cloudwatch_log_group.webhook
  id = "/aws/lambda/agusgonzaleznic-storyblok-rebuild"
}

resource "aws_cloudwatch_log_group" "contact" {
  name              = local.contact_log_group_name
  retention_in_days = 30
  tags              = local.tags
}

resource "aws_cloudwatch_log_group" "webhook" {
  name              = local.webhook_log_group_name
  retention_in_days = 30
  tags              = local.tags
}

# ---- Notification channel ---------------------------------------------------
# SNS -> Lambda -> SESv2, NOT an SNS `email` subscription.
#
# The email protocol was the obvious choice and it does not hold. Every message
# SNS sends to an email endpoint carries an unsubscribe link that is an ordinary
# unauthenticated HTTP GET, so anything able to fetch a URL out of that mailbox
# can cancel the subscription: no credentials, no confirmation step, and nothing
# attributable in CloudTrail, because there is no principal to record. That is
# not hypothetical here — the subscription was confirmed on 2026-08-21 at
# 08:30 UTC, unsubscribed at 15:49, re-subscribed by hand, and unsubscribed
# again 13 minutes later, leaving a live topic whose subscription ARN read
# `Deleted` while all four alarms below still pointed at it. Alerts went
# nowhere and nothing said so.
#
# A Lambda subscription has no equivalent surface: Terraform creates it, only an
# authenticated IAM caller can remove it, and every removal is a CloudTrail
# event with a principal attached. It also drops the manual click-to-confirm
# step that made the old channel dead on arrival after every fresh apply.
resource "aws_sns_topic" "alerts" {
  name         = "agusgonzaleznic-site-alerts"
  display_name = "agusgonzaleznic.com alerts"
  tags         = local.tags
}

data "archive_file" "alert_relay" {
  type        = "zip"
  source_dir  = "${path.module}/alert-relay-src"
  output_path = "${path.module}/.terraform/alert-relay.zip"
  excludes    = ["index.test.mjs"]
}

data "aws_iam_policy_document" "alert_relay_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "alert_relay" {
  name               = "agusgonzaleznic-alert-relay-role"
  assume_role_policy = data.aws_iam_policy_document.alert_relay_assume.json

  # REQUIRED, same as the contact role: CI may only create agusgonzaleznic-*
  # roles carrying this boundary. The boundary already allows ses:SendEmail on
  # the identity and the configuration set, pinned to the same From address, so
  # the relay's MAIL path needed no bootstrap-tier change.
  #
  # Its DLQ path did. The boundary granted no SQS action at all, so
  # WriteDiscardedAlertToDlq below would have been inert: the destination
  # configured, the queue visible, and every delivery into it denied. That is a
  # dead-letter queue reporting zero messages for the wrong reason, which is
  # worse than having none. PR #143 added sqs:SendMessage to the boundary first,
  # which is why this could not land behind a single gate.
  permissions_boundary = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/agusgonzaleznic-lambda-exec-boundary"

  tags = local.tags
}

resource "aws_iam_role_policy_attachment" "alert_relay_logs" {
  role       = aws_iam_role.alert_relay.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "alert_relay" {
  # Send ONLY as the pinned From address, ONLY via the one identity, and name
  # the configuration set so alert mail gets the same bounce/complaint tracking
  # as the contact form. Both resource types are required: ses:SendEmail
  # authorises against the identity AND the configuration set when the request
  # names one, so listing only the identity fails AccessDenied at runtime.
  statement {
    sid     = "SendAlertEmail"
    actions = ["ses:SendEmail"]
    resources = [
      aws_sesv2_email_identity.main.arn,
      aws_sesv2_configuration_set.contact.arn,
    ]

    condition {
      test     = "StringEquals"
      variable = "ses:FromAddress"
      values   = [local.contact_mail_from]
    }
  }

  # Lambda writes to an on-failure destination using the FUNCTION'S OWN
  # execution role, not a service principal, so without this the destination is
  # configured and every delivery into it is denied. That would make the DLQ a
  # second thing that looks present and holds nothing, which is the exact
  # failure shape the rest of this file exists to remove.
  #
  # HALF OF A PAIR. Effective permissions are the INTERSECTION of this role and
  # agusgonzaleznic-lambda-exec-boundary (terraform/bootstrap/role-policies.tf),
  # so this statement grants nothing on its own. The boundary's matching
  # WriteDiscardedAlertToDlq shipped first in PR #143 and is applied; verified
  # after that apply with iam simulate-principal-policy, which returned
  # implicitDeny for sqs:SendMessage on this role while the boundary already
  # allowed it, i.e. this half was the one still missing. Same trap the
  # boundary's SendContactEmail statement documents: widening one side of an
  # intersection changes nothing. If either half is ever removed, the queue keeps
  # existing and silently stops receiving.
  #
  # Only SendMessage. The relay never reads or deletes from this queue; draining
  # it is a human recovery step, and a role that can delete from its own DLQ can
  # erase the evidence of its own failure.
  statement {
    sid       = "WriteDiscardedAlertToDlq"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.alert_relay_dlq.arn]
  }
}

resource "aws_iam_role_policy" "alert_relay" {
  name   = "alert-relay-runtime"
  role   = aws_iam_role.alert_relay.id
  policy = data.aws_iam_policy_document.alert_relay.json
}

# Declared explicitly so retention is bounded from the start; letting Lambda
# create it on first invocation yields a never-expiring group.
resource "aws_cloudwatch_log_group" "alert_relay" {
  name              = "/aws/lambda/${local.alert_relay_function_name}"
  retention_in_days = 30
  tags              = local.tags
}

resource "aws_lambda_function" "alert_relay" {
  function_name = local.alert_relay_function_name
  role          = aws_iam_role.alert_relay.arn
  runtime       = "nodejs22.x"
  handler       = "index.handler"
  architectures = ["arm64"]

  # 512 MB for the same reason as the contact Lambda: CPU is proportional to
  # memory, and the SESv2 client is imported inside the handler, so at 128 MB the
  # SDK load and TLS handshake run on a fraction of a vCPU. An alert that needs
  # two SNS retries to get through is an alert that arrives late.
  memory_size = 512
  timeout     = 15

  filename         = data.archive_file.alert_relay.output_path
  source_code_hash = data.archive_file.alert_relay.output_base64sha256

  environment {
    variables = {
      MAIL_FROM             = local.contact_mail_from
      MAIL_FROM_NAME        = "agusgonzaleznic.com alerts"
      MAIL_TO               = local.contact_mail_to
      SES_CONFIGURATION_SET = aws_sesv2_configuration_set.contact.configuration_set_name
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.alert_relay_logs,
    aws_cloudwatch_log_group.alert_relay,
  ]

  tags = local.tags
}

resource "aws_lambda_permission" "alert_relay_sns" {
  statement_id  = "AllowExecutionFromSNS"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.alert_relay.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.alerts.arn
}

resource "aws_sns_topic_subscription" "alerts_relay" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.alert_relay.arn

  # Without the invoke permission in place first, SNS marks the subscription
  # unconfirmed and silently drops everything published to it.
  depends_on = [aws_lambda_permission.alert_relay_sns]
}

# ---- Dead-letter target for the relay ---------------------------------------
# BEFORE THIS APPLIES: the deploy role has NO sqs grant. Nothing in
# terraform/bootstrap/ matches /sqs/i, so aws_sqs_queue.alert_relay_dlq fails
# CreateQueue with AccessDenied, the same way cloudfront:CreateCachePolicy did.
# A bootstrap-tier change is a prerequisite here, not a follow-up.
#
# WHY ANY OF THIS. The relay is the LAST hop, so nothing downstream notices it
# failing. SNS retries the async invocation and then DISCARDS the message; the
# four alarms below all watch the contact form, and the relay's own failure
# produces no metric anyone reads. So an SES throttle, an IAM or SSM problem or
# a handler exception takes the alert with it and leaves nothing behind to find.
# The failure of the thing that delivers failures is silent.
#
# WHY SQS AND NOT AN SNS DLQ. The SNS option was the shorter diff and it fails
# twice over. Pointing it at aws_sns_topic.alerts is circular: that topic's only
# subscriber is the relay that just failed, so the rescue path IS the broken
# path, and a redelivery loop is the optimistic reading. A second, separate
# topic breaks the circle and still does not work, because SNS stores nothing:
# it pushes, retries, drops. A dead-letter target whose whole job is to still be
# holding the message when a human finally looks cannot be a channel that
# forgets. SQS is durable, re-readable, and passive, and passive matters here on
# its own: nothing invokes a queue, so a broken relay cannot be re-triggered by
# its own dead letters.
resource "aws_sqs_queue" "alert_relay_dlq" {
  name = local.alert_relay_dlq_name

  # 14 days, the SQS maximum, and the number follows from the limitation stated
  # above the alarm below: this queue cannot reliably page anyone, so the only
  # thing bounding how long a discarded alert stays recoverable is how long SQS
  # keeps it. The 4-day default silently loses anything that fails at the start
  # of a two-week absence. Cost is not an argument against the maximum: the
  # volume ceiling is the number of alarm transitions, single digits per month.
  message_retention_seconds = 1209600

  # SSE-SQS, stated rather than inherited from the account default. A KMS CMK
  # would need kms:GenerateDataKey on the relay role AND the same action added
  # to the permissions boundary, whose only KMS grant today is pinned to
  # kms:ViaService = ssm. That is real added surface for nothing: an alarm
  # notification carries an alarm name, a description and a metric value, never
  # a submitter's message or IP address.
  sqs_managed_sse_enabled = true

  # No consumer and no redrive, on purpose. Draining is a human recovery step,
  # and the default 30s visibility timeout means a message read during triage
  # reappears instead of disappearing mid-investigation.

  tags = local.tags
}

# WHICH LAMBDA MECHANISM. There are two and they are not variants of one
# feature:
#
#  * dead_letter_config on the function delivers the ORIGINAL EVENT ONLY. You
#    learn which alert was lost and nothing about why: no error, no error type,
#    no request id, no attempt count.
#  * an on_failure destination delivers a record that wraps that same event in
#    requestContext (requestId, condition, approximateInvokeCount) and
#    responsePayload (the thrown error and its type), and it is the only one of
#    the two with retry and event-age controls.
#
# The destination record is a strict superset, and setting both makes Lambda
# write to both on every failure: two messages, one of them strictly less
# useful. So the destination, alone.
#
# The error half is what makes it worth the resource. The plausible causes here
# are indistinguishable from the event alone: an SES throttle, a boundary or
# role denial, and a code error all produce the identical SNS payload going in,
# and each needs a different fix.
resource "aws_lambda_function_event_invoke_config" "alert_relay" {
  function_name = aws_lambda_function.alert_relay.function_name

  destination_config {
    on_failure {
      destination = aws_sqs_queue.alert_relay_dlq.arn
    }
  }

  # The AWS default (3 attempts total), restated so it cannot drift silently.
  # Enough to ride out a transient SES throttle, which is the one failure in
  # this path that retrying actually fixes.
  maximum_retry_attempts = 2

  # 5 minutes, against a 6-hour default. Async retries back off, so the default
  # lets Lambda keep re-attempting an alert for hours after it stopped being
  # actionable, and the DLQ (the only durable record) stays empty for all of
  # them. The two retries above land roughly 1 and 3 minutes in, so 300s caps
  # the tail without cutting a retry short. Same reasoning as the 512 MB above:
  # an alert that arrives late is an alert that did not arrive.
  maximum_event_age_in_seconds = 300
}

# THE CIRCULARITY, STATED PLAINLY. An alarm is what would make this queue
# proactive rather than forensic, and it cannot be fully trusted, because its
# only delivery path is aws_sns_topic.alerts, whose only subscriber is the relay
# whose failure put the message here. There is no non-circular push channel in
# this account to escape to, and each candidate was checked: an SNS email
# subscription is the unauthenticated-unsubscribe channel this file rejects
# above with a dated incident; a second relay Lambda would share the SES
# dependency and the same permissions boundary that are the likeliest causes in
# the first place, so it is independence in name only; Budgets' direct-email
# notifications, the one push path here that does not traverse SNS, fire only on
# cost.
#
# The alarm is kept, with its limits understood, because the two failure classes
# are not equally hopeless:
#
#  * ONE alert fails (an SES throttle, one malformed message) and the relay is
#    otherwise healthy. The notification goes out normally and is the only thing
#    that will ever say so.
#  * the relay is DOWN. The notification dies with everything else and lands in
#    this same queue. That case is post-hoc RECOVERY only: the DLQ holds the
#    alert for 14 days and something outside this chain has to begin the
#    investigation.
#
# It does not loop. CloudWatch notifies on state TRANSITION only, and the queue
# stays non-empty until a human drains it, so the alarm holds ALARM and
# publishes once, adding at most one extra message here.
resource "aws_cloudwatch_metric_alarm" "alert_relay_dlq" {
  alarm_name        = "agusgonzaleznic-alert-relay-dlq"
  alarm_description = "An alert was DISCARDED before it could be emailed: whatever the site was trying to report, nobody was told. The message in agusgonzaleznic-alert-relay-dlq carries the original SNS event plus the error that killed the invocation. Read it, fix the cause, then drain the queue, because this alarm cannot return to OK while anything is left in it. If the relay itself is down this notification never arrived either, so treat a non-empty queue found by hand the same way."

  namespace   = "AWS/SQS"
  metric_name = "ApproximateNumberOfMessagesVisible"
  dimensions = {
    QueueName = aws_sqs_queue.alert_relay_dlq.name
  }

  # Maximum, not the Sum used by the alarms below. This metric is a gauge, not a
  # count of events, so summing the samples in a period reports a multiple of
  # the queue depth rather than the depth. And Visible rather than
  # NumberOfMessagesSent: Sent is a transition that self-clears, so the alarm
  # would go green with the message still sitting undrained, which is precisely
  # the kind of silence this file exists to remove.
  statistic           = "Maximum"
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"

  # SQS publishes queue metrics every 5 minutes, so a shorter period would spend
  # most of its intervals evaluating no data.
  period = 300

  # notBreaching, and unlike the alarms below this one is load-bearing rather
  # than conventional: SQS stops publishing metrics for a queue that has been
  # idle and empty for about 6 hours, which is the normal state of a healthy
  # DLQ. Under "breaching" that healthy silence becomes a permanent false alarm,
  # and under "missing" the alarm sits in INSUFFICIENT_DATA and never evaluates.
  treat_missing_data = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
  tags          = local.tags
}

# ---- Fail-closed alarms -----------------------------------------------------
# Two metric filters over the contact log, one per fail-closed CLASS:
#
#  * ddb_error  — the rate-limit / replay / duplicate backend is unreachable.
#    Every such path deliberately fails CLOSED (rejects the submission) rather
#    than admitting unmetered traffic, so this is silent lost mail.
#  * ses_send   — the message passed all ten controls and then could not be
#    delivered. This is the exact shape of the incident that lost the lead.
#
# Both patterns key on the JSON log fields the Lambda emits. `ses_send` is
# logged twice per failure (the outcome line and the control line), which is why
# the alarm is sized on datapoints rather than an exact count.
resource "aws_cloudwatch_log_metric_filter" "contact_ddb_error" {
  name           = "agusgonzaleznic-contact-ddb-error"
  log_group_name = aws_cloudwatch_log_group.contact.name
  pattern        = "{ $.status = \"ddb_error\" }"

  metric_transformation {
    name      = "ContactDdbError"
    namespace = "agusgonzaleznic/contact"
    value     = "1"
    unit      = "Count"
    # Emit an explicit 0 when nothing matches, so the alarm has data to evaluate
    # and sits in OK instead of INSUFFICIENT_DATA forever.
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "contact_delivery_failed" {
  name           = "agusgonzaleznic-contact-delivery-failed"
  log_group_name = aws_cloudwatch_log_group.contact.name
  pattern        = "{ $.control = \"ses_send\" }"

  metric_transformation {
    name          = "ContactDeliveryFailed"
    namespace     = "agusgonzaleznic/contact"
    value         = "1"
    unit          = "Count"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "contact_delivery_failed" {
  alarm_name        = "agusgonzaleznic-contact-delivery-failed"
  alarm_description = "A contact-form submission passed every control and then FAILED TO SEND. Silent lost lead — check the SES identity, the ses:FromAddress condition, and the sandbox recipient rules."

  namespace           = "agusgonzaleznic/contact"
  metric_name         = "ContactDeliveryFailed"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  # A single lost enquiry is worth an email, so treat missing data as OK rather
  # than suppressing the alarm.
  treat_missing_data = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
  tags          = local.tags
}

resource "aws_cloudwatch_metric_alarm" "contact_ddb_error" {
  alarm_name        = "agusgonzaleznic-contact-ddb-error"
  alarm_description = "The contact form's DynamoDB-backed controls are failing. They fail CLOSED, so submissions are being rejected. The `err` field in the log line carries the SDK exception class (throttling vs deleted table vs IAM denial)."

  namespace           = "agusgonzaleznic/contact"
  metric_name         = "ContactDdbError"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
  tags          = local.tags
}

# ---- Cost guardrail ---------------------------------------------------------
# /api/* is a public POST endpoint in front of Lambda + DynamoDB + SES, and this
# account has no WAF. The controls bound abuse but every rejected request still
# bills CloudFront + Lambda invocation + a DynamoDB write.
#
# This is DETECTIVE, not preventive: an ACTUAL notification lands after the spend
# has happened, so the FORECASTED threshold is the one that gives warning. The
# preventive half is the WAF rate rule noted in terraform/README.md.
#
# Two budgets are free per account; this uses one.
resource "aws_budgets_budget" "monthly" {
  name         = "agusgonzaleznic-site-monthly"
  budget_type  = "COST"
  limit_amount = "10"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [local.contact_mail_to]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [local.contact_mail_to]
  }
}

################################################################################
# SES delivery outcomes — the half the log contract cannot see.
#
# The alarms above watch this Lambda's own log lines, which is right for anything
# the handler decides. Bounces and complaints are different: they happen minutes
# AFTER SendEmail returned 200 and the handler logged ses_send ok. Nothing in the
# logs will ever mention them, so acceptance was being reported as delivery.
#
# Metrics come from the configuration set's CloudWatch event destination
# (ses.tf). Dimension name and value must match the dimension_configuration
# there exactly, or the alarm watches an empty series and stays green forever —
# which is the failure mode these exist to prevent, so it is worth re-reading
# both sides together when either changes.
################################################################################

locals {
  ses_alarm_dimensions = {
    "ses:configuration-set" = aws_sesv2_configuration_set.contact.configuration_set_name
  }
}

resource "aws_cloudwatch_metric_alarm" "contact_ses_bounce" {
  alarm_name        = "agusgonzaleznic-contact-ses-bounce"
  alarm_description = "A contact-form notification BOUNCED. SendEmail had already returned 200 and the handler logged success, so nothing else will tell you: the enquiry is lost. Check the recipient mailbox and the SES suppression list."

  namespace   = "AWS/SES"
  metric_name = "Bounce"
  dimensions  = local.ses_alarm_dimensions

  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  # One bounce is one lost enquiry on a form that receives a handful a week.
  treat_missing_data = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
  tags          = local.tags
}

resource "aws_cloudwatch_metric_alarm" "contact_ses_complaint" {
  alarm_name        = "agusgonzaleznic-contact-ses-complaint"
  alarm_description = "A contact-form notification was marked as SPAM by the recipient. On a form whose only recipient is the site owner this should be impossible, so it means mail is reaching somewhere it should not — or the domain's reputation is being damaged by something using this identity."

  namespace   = "AWS/SES"
  metric_name = "Complaint"
  dimensions  = local.ses_alarm_dimensions

  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
  tags          = local.tags
}
