import assert from "assert";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import config from "./config";
import { open } from "./db";

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

  it("open() migrates database", function () {
    const conn = open();

    const tables = conn.pragma("table_list");

    assert.ok(tables.length > 2);
  });
});
