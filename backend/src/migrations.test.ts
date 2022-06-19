import assert from "assert";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import config from "./config";
import { open } from "./db";
import {
  CannotRevertMigration,
  InvalidTargetVersion,
  M,
  Migrations,
} from "./migrations";

describe("Database migrations", function () {
  let FILE: string;

  beforeEach(function () {
    FILE = randomUUID();
    config.set("server.db_file", FILE);
  });

  afterEach(async function () {
    await fs.rm(FILE);
    config.set("server.db_file", config.get("server.db_file"));
  });

  it("can migrate up", function () {
    const conn = open();
    let migrations = new Migrations([M.up("CREATE TABLE m1 (a, b, c);")]);
    migrations.toLatest(conn);
    assert.equal(conn.pragma("user_version", { simple: true }), 1);
  });

  it("can migrate down", function () {
    const conn = open();
    let migrations = new Migrations([
      M.up("CREATE TABLE m1 (a,b,c);").down("DROP TABLE m1;"),
    ]);
    migrations.toLatest(conn);
    migrations.goto(conn, 0);

    assert.equal(conn.pragma("user_version", { simple: true }), 0);
  });

  it("doesn't fail with empty migrations", function () {
    const conn = open();
    let migrations = new Migrations([]);
    migrations.toLatest(conn);
    assert.equal(conn.pragma("user_version", { simple: true }), 0);
  });

  it("can't migrate when given an invalid migration", function () {
    const conn = open();
    let migrations = new Migrations([]);
    assert.throws(() => migrations.goto(conn, 10), InvalidTargetVersion);
  });

  it("can't migration when a down operation has not been defined", function () {
    const conn = open();
    let migrations = new Migrations([M.up("CREATE TABLE m1 (a, b, c);")]);
    migrations.toLatest(conn);
    assert.throws(() => migrations.goto(conn, 0), CannotRevertMigration);
  });

  it("database is left untouched on forward migration failure", function () {
    const conn = open();
    let migrations = new Migrations([
      M.up("CREATE TABLE m1 (a, b);"),
      M.up("CREATE TABLE m1 (a);"),
    ]);

    migrations.goto(conn, 1);
    assert.equal(conn.pragma("user_version", { simple: true }), 1);

    assert.throws(() => migrations.goto(conn, 2));
    assert.equal(conn.pragma("user_version", { simple: true }), 1);
  });

  it("database is left untouched on reverse migration failure", function () {
    const conn = open();
    let migrations = new Migrations([
      M.up("CREATE TABLE m1 (a, b)").down("DROP TABLE m2;"),
    ]);
    migrations.toLatest(conn);
    assert.equal(conn.pragma("user_version", { simple: true }), 1);

    assert.throws(() => migrations.goto(conn, 0));
    assert.equal(conn.pragma("user_version", { simple: true }), 1);
  });
});
