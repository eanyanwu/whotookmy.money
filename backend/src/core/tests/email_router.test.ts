import assert from "assert";
import { open } from "../../db";
import { CouldNotRouteEmail, routeEmail } from "../email_router";

describe("routeEmail", () => {
  it("throws when we can't route", () => {
    assert.throws(() => {
      routeEmail({
        to: "person@example.org",
        from: "person2@example.org",
        timestamp: 0,
        tzOffset: 0,
        subject: "",
        messageId: "",
        body: "",
      });
    }, CouldNotRouteEmail);
  });

  it("info@ sends dashboard link", () => {
    const c = open();
    routeEmail({
      to: "info@dev.whotookmy.money",
      from: "person@example.org",
      timestamp: 0,
      tzOffset: 0,
      subject: "",
      messageId: "",
      body: "",
    });

    const res = c.prepare(`SELECT subject, body FROM outbound_email`).get();

    assert.equal(res.subject, "Welcome!");
    assert.ok(
      res.body.includes(
        "https://dev.whotookmy.money/dashboard?email=person@example.org&mac="
      )
    );
  });

  it("ingests a chase credit card alert", () => {
    const c = open();
    routeEmail({
      to: "person@example.org",
      from: "no.reply.alerts@chase.com",
      timestamp: 0,
      tzOffset: 0,
      subject: "Your $28.40 transaction with STOP & SHOP 0081",
      messageId: "",
      body: "Merchant\nSTOP & SHOP\nAmount\n$28.40",
    });

    const purchase = c.prepare(
      `SELECT amount_in_cents as amount, merchant, timestamp FROM purchase`
    ).get();

    assert.equal(purchase.amount, 2840);
    assert.equal(purchase.merchant, "STOP & SHOP");
    assert.equal(purchase.timestamp, 0);
  });

  it("ingests a chase debit card alert", () => {
    const c = open();
    routeEmail({
      to: "person@example.org",
      from: "no.reply.alerts@chase.com",
      timestamp: 0,
      tzOffset: 0,
      subject: "Your debit card transaction of $13.28 from account ending in",
      messageId: "",
      body: "Description\nSQ * THE BOOKSTORE\nAmount\n$13.28",
    });

    const purchase = c.prepare(
      `SELECT amount_in_cents as amount, merchant, timestamp FROM purchase`
    ).get();

    assert.equal(purchase.amount, 1328);
    assert.equal(purchase.merchant, "SQ * THE BOOKSTORE");
    assert.equal(purchase.timestamp, 0);
  });

  it("ingests schwab debit card alert", () => {
    const c = open();
    routeEmail({
      to: "person@example.org",
      from: "donotreply-comm@schwab.com",
      timestamp: 0,
      tzOffset: 0,
      subject: "Your card was used online, by phone or mail",
      messageId: "",
      body: "Amount\nVENMO\n$25.00",
    });

    const purchase = c.prepare(
      `SELECT amount_in_cents as amount, merchant, timestamp FROM purchase`
    ).get();

    assert.equal(purchase.amount, 2500);
    assert.equal(purchase.merchant, "VENMO");
    assert.equal(purchase.timestamp, 0);
  });
});
