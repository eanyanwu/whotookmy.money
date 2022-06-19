import assert from "assert";
import { randomUUID } from "crypto";
import config from "../config";
import { open, open_and_init } from "../db";
import { getOrCreateUser, savePurchase } from "./index";

describe("getOrCreateUser", () => {
  let FILE: string;

  beforeEach(function () {
    FILE = `${randomUUID()}.db`;
    config.set("server.db_file", FILE);
    open_and_init();
  });

  afterEach(async function () {
    //await fs.rm(FILE);
    config.set("server.db_file", config.get("server.db_file"));
  });

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
