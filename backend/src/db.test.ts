import assert from "assert";
import config from "./config";
import { open, open_and_init } from "./db";
import { randomUUID } from "crypto";
import fs from "fs/promises";

describe("Database", function () {
  let FILE: string;

  beforeEach(function () {
    FILE = randomUUID();
    config.set("server.db_file", FILE);
  });

  afterEach(async function () {
    try {
      await fs.rm(FILE);
    } catch (_) {}
    config.set("server.db_file", config.get("server.db_file"));
  });

  it("open() dost not migrate database", function () {
    const conn = open();

    const tables = conn.pragma("table_list");

    // main + temp
    assert.equal(tables.length, 2);
  });

  it("open_and_init() migrates database", function () {
    const conn = open_and_init();

    const tables = conn.pragma("table_list");

    assert.ok(tables.length > 2);
  });
});
