import assert from "assert";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import config from "../config";
import { open, open_and_init } from "../db";
import {
  EmailRateLimit,
  getOrCreateUser,
  lookupUser,
  markEmailSent,
  NoRowsReturned,
  pollUnsentEmail,
  queueEmail,
  savePurchase,
} from "./index";

let FILE: string;

beforeEach(function () {
  FILE = `${randomUUID()}.db`;
  config.set("server.db_file", FILE);
  open_and_init();
});

afterEach(async function () {
  await fs.rm(FILE);
  config.set("server.db_file", config.get("server.db_file"));
});

describe("getOrCreateUser", () => {
  it("creates new user", () => {
    const [user, isNew] = getOrCreateUser({ email: "person@example.org" });

    const c = open();
    const count = c.prepare(`SELECT count(*) as count from user`).get().count;

    assert.equal(count, 1);
    assert.equal(user.userEmail, "person@example.org");
    assert.equal(user.tzOffset, 0);
    assert.equal(isNew, true);
  });

  it("returns existing user", () => {
    const c = open();
    c.prepare(
      `INSERT INTO user (user_email, tz_offset)
      VALUES ('person@example.org', 13)`
    ).run();

    const [user, isNew] = getOrCreateUser({ email: "person@example.org" });

    const count = c.prepare(`SELECT count(*) as count from user`).get().count;
    assert.equal(count, 1);
    assert.equal(user.tzOffset, 13);
    assert.equal(isNew, false);
  });
});

describe("lookupUser", () => {
  it("fails if user does not exist", () => {
    assert.throws(() => lookupUser({ id: 1 }), NoRowsReturned);
  });

  it("finds user", () => {
    const c = open();

    c.prepare(
      `INSERT INTO user (user_email, tz_offset)
      VALUES ('person@example.org', 12)`
    ).run();

    const user = lookupUser({ id: 1 });

    assert.equal(user.userEmail, "person@example.org");
    assert.equal(user.tzOffset, 12);
  });
});

describe("savePurchase", () => {
  it("creates a new purchase for user", () => {
    const c = open();
    const [user, _] = getOrCreateUser({ email: "person@example.org" });
    savePurchase({
      user,
      amount: 1000,
      merchant: "AIRBNB",
      timestamp: 1,
    });

    const purchase = c
      .prepare(
        `SELECT user_id, amount_in_cents, merchant, timestamp, created_at
      FROM purchase`
      )
      .get();

    assert.equal(purchase.user_id, 1);
    assert.equal(purchase.amount_in_cents, 1000);
    assert.equal(purchase.merchant, "AIRBNB");
    assert.equal(purchase.timestamp, 1);
    assert.ok(purchase.created_at);
  });
});

describe("queueEmail", () => {
  it("queues email", () => {
    const email = queueEmail({
      sender: "from@example.org",
      to: "to@example.org",
      subject: "subject",
      body: "body",
      body_html: "<html>",
    });

    assert.equal(email.sender, "from@example.org");
    assert.equal(email.userId, 1);
    assert.equal(email.subject, "subject");
    assert.equal(email.body, "body");
    assert.equal(email.bodyHtml, "<html>");
    assert.equal(email.sentAt, null);
    assert.ok(email.createdAt);
  });

  it("fails to queue email when an unsent one already exists", () => {
    queueEmail({
      sender: "from@example.org",
      to: "to@example.org",
      subject: "subject",
      body: "body",
      body_html: "<html>",
    });

    assert.throws(
      () =>
        queueEmail({
          sender: "from@example.org",
          to: "to@example.org",
          subject: "subject",
          body: "body",
          body_html: "<html>",
        }),
      EmailRateLimit
    );
  });

  it("fails to queue email if we sent one recently", () => {
    queueEmail({
      sender: "from@example.org",
      to: "to@example.org",
      subject: "subject",
      body: "body",
      body_html: "<html>",
    });

    let c = open();
    c.prepare(`UPDATE outbound_email SET sent_at = strftime('%s')`).run();

    assert.throws(
      () =>
        queueEmail({
          sender: "from@example.org",
          to: "to@example.org",
          subject: "subject",
          body: "body",
          body_html: "<html>",
        }),
      EmailRateLimit
    );
  });

  it("queues email if we sent one more than 5 minutes ago", () => {
    queueEmail({
      sender: "from@example.org",
      to: "to@example.org",
      subject: "subject",
      body: "body",
      body_html: "<html>",
    });

    let c = open();
    c.prepare(`UPDATE outbound_email SET sent_at = strftime('%s') - 301`).run();

    queueEmail({
      sender: "from@example.org",
      to: "to@example.org",
      subject: "subject",
      body: "body",
      body_html: "<html>",
    });

    const count = c
      .prepare(`SELECT count(*) as count FROM outbound_email`)
      .get().count;
    assert.equal(count, 2);
  });
});

describe("markEmailSent & pollUnsentEmail", () => {
  it("the two functions work together predictably", () => {
    let c = open();
    c.exec(
      `INSERT INTO user (user_email)
      VALUES ('person@example.org');

      INSERT INTO outbound_email (user_id, sender, subject, body)
      VALUES
      (1, 'sender1', 'subject1', 'body1'),
      (1, 'sender2', 'subject2', 'body2')`
    );

    // Multiple calls yield the same email if it has not been sent
    let [first] = pollUnsentEmail()!;
    let [second] = pollUnsentEmail()!;
    assert.deepStrictEqual(first, second);

    assert.equal(first.sender, "sender1");

    markEmailSent(first);

    // Calling poll should yield a differnt email now
    let [third] = pollUnsentEmail()!;
    assert.notEqual(third.outboundEmailId, first.outboundEmailId);
    assert.equal(third.sender, "sender2");

    markEmailSent(third);

    assert.equal(pollUnsentEmail(), undefined);
  });
});
