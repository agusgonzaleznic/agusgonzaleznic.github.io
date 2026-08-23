// Unit tests for the alert relay. Run: node --test (in this directory)
//
// The relay is the LAST hop in the alerting chain, so nothing downstream would
// notice it misbehaving -- which is exactly why its behaviour is pinned here
// rather than left to be discovered the first time an alarm fires.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  handler,
  formatAlarm,
  __setTestDeps,
  __resetTestDeps,
} from "./index.mjs";

const FROM = "noreply@agusgonzaleznic.com";
const TO = "me@agusgonzaleznic.com";

function install() {
  const calls = [];
  __resetTestDeps();
  __setTestDeps({
    sesSend: async (params) => {
      calls.push(params);
      return { MessageId: `stub-${calls.length}` };
    },
  });
  process.env.MAIL_FROM = FROM;
  process.env.MAIL_TO = TO;
  process.env.MAIL_FROM_NAME = "Site alerts";
  delete process.env.SES_CONFIGURATION_SET;
  return { calls };
}

const ALARM = {
  AlarmName: "agusgonzaleznic-contact-ses-bounce",
  AlarmDescription: "A contact notification bounced.",
  NewStateValue: "ALARM",
  NewStateReason: "Threshold Crossed: 1 datapoint [1.0] was greater than 0.0.",
  StateChangeTime: "2026-08-23T06:18:52.982+0000",
  Region: "US East (N. Virginia)",
};

function snsEvent(message, subject = "AWS Notification") {
  return {
    Records: [
      {
        Sns: {
          MessageId: "m-1",
          Subject: subject,
          Message: typeof message === "string" ? message : JSON.stringify(message),
        },
      },
    ],
  };
}

// --- formatting --------------------------------------------------------------

test("an ALARM is subject-tagged FIRING and keeps its reason", () => {
  const { subject, body } = formatAlarm("AWS Notification", JSON.stringify(ALARM));
  assert.equal(subject, "[FIRING] agusgonzaleznic-contact-ses-bounce");
  assert.match(body, /State:\s+ALARM/);
  assert.match(body, /Threshold Crossed/);
  assert.match(body, /A contact notification bounced\./);
});

test("a recovery is RESOLVED, not another FIRING", () => {
  const { subject } = formatAlarm("", JSON.stringify({ ...ALARM, NewStateValue: "OK" }));
  assert.equal(subject, "[RESOLVED] agusgonzaleznic-contact-ses-bounce");
});

test("INSUFFICIENT_DATA is labelled as itself, not dressed up as a recovery", () => {
  const { subject } = formatAlarm(
    "",
    JSON.stringify({ ...ALARM, NewStateValue: "INSUFFICIENT_DATA" }),
  );
  assert.equal(subject, "[INSUFFICIENT_DATA] agusgonzaleznic-contact-ses-bounce");
});

test("a non-JSON message is relayed VERBATIM instead of being dropped", () => {
  const { subject, body } = formatAlarm("Manual test", "just a plain string");
  assert.equal(subject, "Manual test");
  assert.equal(body, "just a plain string");
});

test("JSON that is not an alarm is also relayed verbatim", () => {
  const raw = JSON.stringify({ something: "else" });
  const { body } = formatAlarm("Other", raw);
  assert.equal(body, raw, "an unrecognised shape must survive intact");
});

test("a message with no subject still gets one", () => {
  const { subject } = formatAlarm("", "body only");
  assert.equal(subject, "Site alert");
});

// --- sending ----------------------------------------------------------------

test("relays one alarm as one email, from the PINNED sender", async () => {
  const { calls } = install();
  const res = await handler(snsEvent(ALARM));
  assert.equal(res.relayed, 1);
  assert.equal(calls.length, 1);
  // The boundary AND the role policy both pin ses:FromAddress to this address.
  // Sending as anything else is denied at runtime, so this is the assertion that
  // would catch a rename before an alarm ever needs to be delivered.
  assert.equal(calls[0].FromEmailAddress, `Site alerts <${FROM}>`);
  assert.deepEqual(calls[0].Destination.ToAddresses, [TO]);
  assert.equal(calls[0].Content.Simple.Subject.Data, `[FIRING] ${ALARM.AlarmName}`);
});

test("every record gets its own email", async () => {
  const { calls } = install();
  const ev = snsEvent(ALARM);
  ev.Records.push({ Sns: { MessageId: "m-2", Subject: "x", Message: "plain" } });
  const res = await handler(ev);
  assert.equal(res.relayed, 2);
  assert.equal(calls.length, 2);
});

test("no records -> nothing sent, and no throw", async () => {
  const { calls } = install();
  const res = await handler({ Records: [] });
  assert.equal(res.relayed, 0);
  assert.equal(calls.length, 0);
});

test("ConfigurationSetName is sent when set", async () => {
  const { calls } = install();
  process.env.SES_CONFIGURATION_SET = "agusgonzaleznic-contact";
  await handler(snsEvent(ALARM));
  assert.equal(calls[0].ConfigurationSetName, "agusgonzaleznic-contact");
});

test("the key is OMITTED entirely when unset - not sent as an empty string", async () => {
  const { calls } = install();
  await handler(snsEvent(ALARM));
  assert.ok(
    !("ConfigurationSetName" in calls[0]),
    "an empty ConfigurationSetName is rejected by SES",
  );
});

test("whitespace-only configuration set is treated as unset", async () => {
  const { calls } = install();
  process.env.SES_CONFIGURATION_SET = "   ";
  await handler(snsEvent(ALARM));
  assert.ok(!("ConfigurationSetName" in calls[0]));
});

test("missing MAIL_FROM throws instead of silently succeeding", async () => {
  const { calls } = install();
  delete process.env.MAIL_FROM;
  await assert.rejects(() => handler(snsEvent(ALARM)), /MAIL_FROM and MAIL_TO/);
  assert.equal(calls.length, 0, "must not attempt a send it cannot attribute");
});

test("missing MAIL_TO throws too", async () => {
  install();
  delete process.env.MAIL_TO;
  await assert.rejects(() => handler(snsEvent(ALARM)), /MAIL_FROM and MAIL_TO/);
});

test("an SES failure propagates so SNS retries rather than losing the alert", async () => {
  install();
  __setTestDeps({
    sesSend: async () => {
      throw new Error("Throttling");
    },
  });
  await assert.rejects(() => handler(snsEvent(ALARM)), /Throttling/);
});
