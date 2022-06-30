import assert from "assert";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import config from "../config";
import { getOrCreateUser, lookupPurchase, savePurchase } from "../data";
import { open_and_init } from "../db";
import { modifyPurchase } from "./modify_purchase";

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

describe("modifyPurchase", () => {
  it("fails to create purchase amendment if purchase does not exist", () => {
    assert.throws(
      () => {
        modifyPurchase({
          id: "1",
          merchant: "a",
          amount: "10.00",
          action: "save",
        });
      },
      (err: Error) => err.message.includes("no rows")
    );
  });

  it("modifies a purchase, then does undo", () => {
    const [user] = getOrCreateUser({ email: "person@example.org" });
    const purchase = savePurchase({
      user,
      amount: 1000,
      merchant: "HELLO",
      timestamp: 1,
    });

    modifyPurchase({
      id: "1",
      merchant: "BYE",
      amount: "20",
      action: "save",
    });

    const modified = lookupPurchase({ id: 1 });

    assert.equal(modified.amountInCents, 2000);
    assert.equal(modified.merchant, "BYE");

    // The undo action only cares about the id
    modifyPurchase({
      id: "1",
      merchant: "whatever",
      amount: "22000000",
      action: "undo",
    });

    const undone = lookupPurchase({ id: 1 });

    assert.equal(undone.amountInCents, 1000);
    assert.equal(undone.merchant, "HELLO");
  });
});
