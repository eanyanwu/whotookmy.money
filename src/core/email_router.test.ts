import assert from "assert";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import config from "../config";
import { open, open_and_init } from "../db";
import { createServerAsync } from "../server";
import { CouldNotRouteEmail, routeEmail } from "./email_router";

describe("routeEmail", () => {
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

  it("throws when we can't route", () => {
    assert.rejects(async () => {
      await routeEmail({
        to: "person@example.org",
        from: "person2@example.org",
        timestamp: 0,
        tzOffset: 0,
        subject: "",
        messageId: "",
      });
    }, CouldNotRouteEmail);
  });

  it("info@ sends dashboard link", async () => {
    const c = open();
    await routeEmail({
      to: "info@dev.whotookmy.money",
      from: "person@example.org",
      timestamp: 0,
      tzOffset: 0,
      subject: "",
      messageId: "",
    });

    const res = c.prepare(`SELECT subject, body FROM outbound_email`).get();

    assert.equal(res.subject, "Welcome!");
    assert.ok(
      res.body.includes("https://dev.whotookmy.money/dashboard?id=1&mac=")
    );
  });

  it("ingests a chase credit card alert", async () => {
    const c = open();
    await routeEmail({
      to: "person@example.org",
      from: "no.reply.alerts@chase.com",
      timestamp: 0,
      tzOffset: 12,
      subject: "Your $28.40 transaction with STOP & SHOP 0081",
      messageId: "",
      body: "Merchant\nSTOP & SHOP\nAmount\n$28.40",
    });

    const purchase = c
      .prepare(
        `SELECT amount_in_cents as amount, merchant, timestamp FROM purchase`
      )
      .get();

    const tzOffset = c.prepare(`SELECT tz_offset FROM user`).get().tz_offset;

    assert.equal(purchase.amount, 2840);
    assert.equal(purchase.merchant, "STOP & SHOP");
    assert.equal(purchase.timestamp, 0);
    assert.equal(tzOffset, 12);
  });

  it("ingests a chase debit card alert", async () => {
    const c = open();
    await routeEmail({
      to: "person@example.org",
      from: "no.reply.alerts@chase.com",
      timestamp: 0,
      tzOffset: 0,
      subject: "Your debit card transaction of $13.28 from account ending in",
      messageId: "",
      body: "Description\nSQ * THE BOOKSTORE\nAmount\n$13.28",
    });

    const purchase = c
      .prepare(
        `SELECT amount_in_cents as amount, merchant, timestamp FROM purchase`
      )
      .get();

    assert.equal(purchase.amount, 1328);
    assert.equal(purchase.merchant, "SQ * THE BOOKSTORE");
    assert.equal(purchase.timestamp, 0);
  });

  it("ingests schwab debit card alert", async () => {
    const c = open();
    await routeEmail({
      to: "person@example.org",
      from: "donotreply-comm@schwab.com",
      timestamp: 0,
      tzOffset: 0,
      subject: "Your card was used online, by phone or mail",
      messageId: "",
      body: "Amount\nVENMO\n$25.00",
    });

    const purchase = c
      .prepare(
        `SELECT amount_in_cents as amount, merchant, timestamp FROM purchase`
      )
      .get();

    assert.equal(purchase.amount, 2500);
    assert.equal(purchase.merchant, "VENMO");
    assert.equal(purchase.timestamp, 0);
  });

  it("confirms gmail forwarding notices", async () => {
    const c = open();
    const server = await createServerAsync({
      host: "localhost",
      port: 8080,
      onRequest: (req, res) => {
        assert.equal(req.method, "POST");
        res.end();
      },
    });

    await routeEmail({
      to: "whoever",
      from: "forwarding-noreply@google.com",
      timestamp: 0,
      tzOffset: 0,
      subject: "",
      messageId: "",
      body: "person@example.org\nhttp://localhost:8080\nConfirmation code: 1234",
    });

    server.close();

    // an email is sent
    const email = c.prepare(`SELECT body FROM outbound_email`).get().body;

    // a user is created
    const user = c.prepare(`SELECT user_email FROM user`).get().user_email;

    assert.equal(email, "1234");
    assert.equal(user, "person@example.org");
  });
});
