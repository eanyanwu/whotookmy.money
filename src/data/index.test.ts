import assert from "assert";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import config from "../config";
import { open, open_and_init } from "../db";
import {
  amendPurchase,
  dailySpend,
  EmailRateLimit,
  getOrCreateUser,
  getRecentPurchases,
  lookupPurchase,
  lookupUser,
  markEmailSent,
  NoRowsReturned,
  pollUnsentEmail,
  queueEmail,
  savePurchase,
  setTzOffset,
} from "./index";

let FILE: string;

beforeEach(function () {
  FILE = `${randomUUID()}.db`;
  config.set("server.dbFile", FILE);
  open_and_init();
});

afterEach(async function () {
  await fs.rm(FILE);
  config.set("server.dbFile", config.get("server.dbFile"));
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

describe("setTzOffset", () => {
  it("sets tz_offset", () => {
    const [user] = getOrCreateUser({ email: "hello@example.com" });
    assert.equal(user.tzOffset, 0);
    user.tzOffset = 12;
    setTzOffset(user);
    const [modified] = getOrCreateUser({ email: user.userEmail });
    assert.equal(user.tzOffset, 12);
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
    const [user] = getOrCreateUser({ email: "person@example.org" });
    const purchase = savePurchase({
      user,
      amount: 1000,
      merchant: "AIRBNB",
      timestamp: 1,
    });

    assert.equal(purchase.userId, 1);
    assert.equal(purchase.amountInCents, 1000);
    assert.equal(purchase.merchant, "AIRBNB");
    assert.equal(purchase.timestamp, 1);
    assert.equal(purchase.isAmended, 0);
    assert.ok(purchase.createdAt);
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

describe("dailySpend", () => {
  it("with no purchases", () => {
    const [user] = getOrCreateUser({ email: "person@example.org" });
    const spend = dailySpend(user, 10);
    assert.deepStrictEqual(spend, []);
  });
  it("with purchases", () => {
    const c = open();
    const [user] = getOrCreateUser({ email: "person@example.org" });
    c.exec(
      `INSERT INTO purchase (user_id, amount_in_cents, merchant, timestamp)
      VALUES
      (1, 1200, 'STORE', strftime('%s', 'now', '-4 days')),
      (1, 1200, 'STORE', strftime('%s', 'now', '-4 days')),

      (1, 2400, 'MOVIE', strftime('%s', 'now', '-3 days')),

      (1, 3600, 'BOOKS', strftime('%s', 'now', '-2 day'));`
    );

    const spend = dailySpend(user, 4);
    assert.equal(spend.length, 5);
    assert.equal(spend[0].spend, 2400);
    assert.equal(spend[1].spend, 2400);
    assert.equal(spend[2].spend, 3600);
    assert.equal(spend[3].spend, 0);
    assert.equal(spend[4].spend, 0);
  });
});

describe("getRecentPurchases", () => {
  it("handles no purchases", () => {
    const [user] = getOrCreateUser({ email: "person@example.org" });
    const purchases = getRecentPurchases(user, 3);
    assert.equal(purchases.length, 0);
  });
  it("retrieves only purchases in range", () => {
    const c = open();

    const [user] = getOrCreateUser({ email: "person@example.org" });
    c.exec(
      `INSERT INTO purchase (user_id, amount_in_cents, merchant, timestamp)
      VALUES
      (1, 1200, 'STORE', strftime('%s', 'now', '-4 days')),

      (1, 2400, 'MOVIE', strftime('%s', 'now', '-3 days')),

      (1, 3600, 'BOOKS', strftime('%s', 'now', '-2 day'));`
    );

    const purchases = getRecentPurchases(user, 3);

    // only the last two purchases should be included
    assert.equal(purchases.length, 2);
  });
});

describe("lookupPurchase", () => {
  it("finds existing purchase", () => {
    const c = open();

    getOrCreateUser({ email: "person@example.org" });
    c.prepare(
      `INSERT INTO purchase (user_id, amount_in_cents, merchant, timestamp, created_at)
      VALUES (1, 1200, 'STORE', 1, 2)`
    ).run();

    const purchase = lookupPurchase({ id: 1 });

    assert.equal(purchase.purchaseId, 1);
    assert.equal(purchase.amountInCents, 1200);
    assert.equal(purchase.merchant, "STORE");
    assert.equal(purchase.timestamp, 1);
    assert.equal(purchase.createdAt, 2);
  });
  it("fails when purchase is not found", () => {
    assert.throws(() => lookupPurchase({ id: 1 }), NoRowsReturned);
  });
});

describe("amendPurchase", () => {
  it("fails when purchase does not exist", () => {
    assert.throws(
      () =>
        amendPurchase({
          purchaseId: 1,
          newAmountInCents: 100,
          newMerchant: "MANSION",
        }),
      NoRowsReturned
    );
  });
  it("creates a purchase amendment if one does not exist", () => {
    const c = open();

    const [user] = getOrCreateUser({ email: "person@example.org" });
    savePurchase({
      user,
      amount: 10,
      merchant: "HOTEL",
      // timestamp is in seconds
      timestamp: Date.now() / 1000,
    });
    amendPurchase({
      purchaseId: 1,
      newAmountInCents: 100,
      newMerchant: "MANSION",
    });

    // Looking up the purchase should reflect the change
    const purchase = lookupPurchase({ id: 1 });
    assert.equal(purchase.amountInCents, 100);
    assert.equal(purchase.merchant, "MANSION");
    assert.equal(purchase.isAmended, 1);

    // Looking up most recent purchases should also reflect the change
    const recent = getRecentPurchases(user, 2);
    assert.equal(recent.length, 1);
    assert.equal(recent[0].amountInCents, 100);
    assert.equal(recent[0].merchant, "MANSION");
    assert.equal(recent[0].isAmended, 1);

    // A new amendment should have been created
    const amendment = c
      .prepare(
        `SELECT
        purchase_id,
        new_amount_in_cents,
        new_merchant
      FROM purchase_amendment`
      )
      .raw()
      .all();

    assert.deepStrictEqual(amendment, [[1, 100, "MANSION"]]);
  });

  it("updates a purchase amendment if one exists", () => {
    const c = open();

    const [user] = getOrCreateUser({ email: "person@example.org" });
    savePurchase({ user, amount: 10, merchant: "HOTEL", timestamp: 1 });
    amendPurchase({
      purchaseId: 1,
      newAmountInCents: 100,
      newMerchant: "MANSION",
    });

    // Further amendments shouldn't create any new rows
    amendPurchase({
      purchaseId: 1,
      newAmountInCents: 99,
      newMerchant: "7eleven",
    });
    amendPurchase({
      purchaseId: 1,
      newAmountInCents: 199,
      newMerchant: "7eleven",
    });

    const amendment = c
      .prepare(
        `SELECT
        purchase_id,
        new_amount_in_cents,
        new_merchant
      FROM purchase_amendment`
      )
      .raw()
      .all();

    assert.deepStrictEqual(amendment, [[1, 199, "7eleven"]]);
  });
});
