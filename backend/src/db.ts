import Connection from "better-sqlite3";
import config from "./config";
import { M, Migrations } from "./migrations";

const SCHEMA: string = `
CREATE TABLE IF NOT EXISTS user (
    user_id INTEGER PRIMARY KEY,
    user_email TEXT NOT NULL UNIQUE,
    tz_offset INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s'))
);
CREATE TABLE IF NOT EXISTS outbound_email (
    outbound_email_id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES user(user_id) ON DELETE CASCADE,
    sender TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT,
    body_html TEXT,
    sent_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s'))
);
CREATE TABLE IF NOT EXISTS purchase (
    purchase_id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES user(user_id) ON DELETE CASCADE,
    amount_in_cents INTEGER NOT NULL,
    merchant TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s'))
);
CREATE TABLE user_report (
    user_report_id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES user(user_id) ON DELETE CASCADE,
    report_type TEXT NOT NULL,
    schedule TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s')),
    UNIQUE (user_id, report_type)
);
            
CREATE TABLE user_report_outbound_email (
    user_report_id INTEGER NOT NULL REFERENCES user_report(user_report_id) ON DELETE CASCADE,
    outbound_email_id ITEGER NOT NULL REFERENCES outbound_email(outbound_email_id) ON DELETE CASCADE,
    PRIMARY KEY (user_report_id, outbound_email_id)
);
`;

const MIGRATIONS: M[] = [];

/* Migrates the database if necessary, registers hooks and returns a connection to it */
export const open = () => {
  const file = config.get("server.db_file");
  const conn = new Connection(file);
  conn.pragma("foreign_keys = ON");
  const migrations = new Migrations([M.up(SCHEMA), ...MIGRATIONS]);

  migrations.toLatest(conn);

  return conn;
};
