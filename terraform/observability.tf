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
  # this relay needed no bootstrap-tier change — which is the only reason this
  # lands behind a single gate.
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
