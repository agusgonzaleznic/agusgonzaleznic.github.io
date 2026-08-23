// Alert relay: SNS topic -> this Lambda -> SESv2 mail to the owner.
//
// WHY THIS EXISTS (it replaced a plain `email` subscription):
// every message SNS sends to an email endpoint carries an unsubscribe link that
// is an ordinary, unauthenticated HTTP GET. Anything that can fetch a URL out of
// that mailbox can therefore cancel the subscription -- no credentials, no
// confirmation step, and nothing attributable in CloudTrail, because there is no
// principal to record. The observed result was a live topic whose subscription
// ARN read `Deleted` while four alarms still pointed at it: alerts going nowhere,
// silently. Clicking Resubscribe just re-armed the same one-click revocation.
//
// A Lambda subscription has no such surface. It is created by Terraform, can
// only be removed by an authenticated IAM caller, and every removal is a
// CloudTrail event with a principal attached.
//
// LAST HOP, and honest about it: this function cannot alert on its own failure --
// the channel it would use is itself. What it has instead is SNS's own async
// retry of a failed Lambda invocation, plus its Errors metric and this log group.
// A chain of watchers watching watchers would just move the same blind spot.
//
// ZERO npm deps: @aws-sdk/client-sesv2 ships in the nodejs22.x runtime.
//
// Env contract (set by terraform/observability.tf):
//   MAIL_FROM               verified SES sender. PINNED by a ses:FromAddress
//                           condition on BOTH the role policy and the
//                           lambda-exec permissions boundary -- effective
//                           permissions are the INTERSECTION, so changing this
//                           alone gets every send denied at runtime.
//   MAIL_FROM_NAME          display name for the From header
//   MAIL_TO                 the owner
//   SES_CONFIGURATION_SET   optional; adds this mail to the same reputation and
//                           bounce/complaint tracking as the contact form

let _sesClient = null;
let _sesSend = null;

// Injection seam for the unit tests, mirroring the contact Lambda's __setTestDeps.
export function __setTestDeps({ sesSend } = {}) {
  if (sesSend) _sesSend = sesSend;
}
export function __resetTestDeps() {
  _sesSend = null;
  _sesClient = null;
}

async function sesSend(params) {
  if (_sesSend) return _sesSend(params);
  const sdk = await import("@aws-sdk/client-sesv2");
  _sesClient ??= new sdk.SESv2Client({});
  return _sesClient.send(new sdk.SendEmailCommand(params));
}

function log(fields) {
  console.log(JSON.stringify(fields));
}

function env() {
  return {
    from: process.env.MAIL_FROM,
    fromName: process.env.MAIL_FROM_NAME ?? "Site alerts",
    to: process.env.MAIL_TO,
    configurationSet: (process.env.SES_CONFIGURATION_SET ?? "").trim(),
  };
}

// CloudWatch publishes its alarm notifications as a JSON document. Rendering the
// handful of fields that decide what to do beats forwarding the raw blob, but a
// message that is NOT that shape (a bare string, or a format AWS changes later)
// must still arrive intact rather than being dropped for failing to parse.
export function formatAlarm(subject, message) {
  let a;
  try {
    a = JSON.parse(message);
  } catch {
    return { subject: subject || "Site alert", body: message };
  }
  if (!a || typeof a !== "object" || typeof a.AlarmName !== "string") {
    return { subject: subject || "Site alert", body: message };
  }

  const state = typeof a.NewStateValue === "string" ? a.NewStateValue : "UNKNOWN";
  // ALARM and OK are the two that matter; INSUFFICIENT_DATA is neither, so it is
  // labelled rather than dressed up as a recovery.
  const marker = state === "ALARM" ? "FIRING" : state === "OK" ? "RESOLVED" : state;

  const lines = [
    `Alarm:  ${a.AlarmName}`,
    `State:  ${state}`,
    a.AlarmDescription ? `\n${a.AlarmDescription}\n` : "",
    a.NewStateReason ? `Reason: ${a.NewStateReason}` : "",
    a.StateChangeTime ? `When:   ${a.StateChangeTime}` : "",
    a.Region ? `Region: ${a.Region}` : "",
  ].filter(Boolean);

  return { subject: `[${marker}] ${a.AlarmName}`, body: lines.join("\n") };
}

export const handler = async (event) => {
  const cfg = env();
  if (!cfg.from || !cfg.to) {
    // Fail LOUD: a misconfigured relay must not look like a quiet success, or the
    // next real alarm disappears with nothing to show why.
    log({ control: "config", status: "missing_env" });
    throw new Error("alert-relay: MAIL_FROM and MAIL_TO are required");
  }

  const records = Array.isArray(event?.Records) ? event.Records : [];
  if (records.length === 0) {
    log({ control: "input", status: "no_records" });
    return { relayed: 0 };
  }

  let relayed = 0;
  for (const record of records) {
    const sns = record?.Sns ?? {};
    const { subject, body } = formatAlarm(sns.Subject ?? "", sns.Message ?? "");

    await sesSend({
      FromEmailAddress: `${cfg.fromName} <${cfg.from}>`,
      Destination: { ToAddresses: [cfg.to] },
      ...(cfg.configurationSet ? { ConfigurationSetName: cfg.configurationSet } : {}),
      Content: {
        Simple: {
          Subject: { Data: subject.slice(0, 200), Charset: "UTF-8" },
          Body: { Text: { Data: body, Charset: "UTF-8" } },
        },
      },
    });

    relayed += 1;
    log({ control: "relay", status: "sent", messageId: sns.MessageId, subject });
  }

  // Throwing on a partial failure is deliberate: SNS retries the invocation, and
  // a duplicate alert is strictly better than a lost one.
  return { relayed };
};
