import assert from "assert";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import config from "../config";
import { open, open_and_init } from "../db";
import { getOrCreateUser, queueEmail, savePurchase, EmailRateLimit } from "./index";

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
    const user = getOrCreateUser({ email: "person@example.org" });

    const c = open();
    const count = c.prepare(`SELECT count(*) as count from user`).get().count;

    assert.equal(count, 1);
    assert.equal(user.userEmail, "person@example.org");
    assert.equal(user.tzOffset, 0);
  });

  it("returns existing user", () => {
    const c = open();
    c.prepare(
      `INSERT INTO user (user_email, tz_offset)
      VALUES ('person@example.org', 13)`
    ).run();

    const user = getOrCreateUser({ email: "person@example.org" });

    const count = c.prepare(`SELECT count(*) as count from user`).get().count;
    assert.equal(count, 1);
    assert.equal(user.tzOffset, 13);
  });
});

describe("savePurchase", () => {
  it("creates a new purchase for user", () => {
    const c = open();
    savePurchase({
      email: "person@example.org",
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

    assert.throws(() => queueEmail({
      sender: "from@example.org",
      to: "to@example.org",
      subject: "subject",
      body: "body",
      body_html: "<html>",
    }), EmailRateLimit);
  });

  it("fails to queue email if we sent one recently" , () => {
    queueEmail({
      sender: "from@example.org",
      to: "to@example.org",
      subject: "subject",
      body: "body",
      body_html: "<html>",
    });

    let c = open();
    c.prepare(`UPDATE outbound_email SET sent_at = strftime('%s')`).run(); 

    assert.throws(() => queueEmail({
      sender: "from@example.org",
      to: "to@example.org",
      subject: "subject",
      body: "body",
      body_html: "<html>",
    }), EmailRateLimit);
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

    const count = c.prepare(`SELECT count(*) as count FROM outbound_email`).get().count;
    assert.equal(count, 2);
  });
});
