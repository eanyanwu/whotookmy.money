use crate::hooks;
use rusqlite::Connection;
use rusqlite_migration::{Migrations, M};
use std::env;
use thiserror::Error;

pub type RowId = i64;

#[derive(Debug, Error)]
pub enum DatabaseError {
    #[error("database error")]
    RusqliteError(#[from] rusqlite::Error),
    #[error("error performing migration")]
    MigrationError(#[from] rusqlite_migration::Error),
}

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS user (
    user_id INTEGER PRIMARY KEY,
    user_email TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s'))
);

CREATE TABLE IF NOT EXISTS outbound_email (
    outbound_email_id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES user(user_id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    body TEXT,
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
";

pub fn init(connection: &mut Connection) -> Result<(), DatabaseError> {
    let migrations = Migrations::new(vec![
        M::up(SCHEMA),
        M::up("ALTER TABLE user ADD COLUMN tz_offset INTEGER NOT NULL DEFAULT 0"),
    ]);

    migrations.to_latest(connection)?;

    connection.update_hook(Some(hooks::update));
    Ok(())
}

pub fn get_connection() -> Result<rusqlite::Connection, DatabaseError> {
    let name = env::var("WTMM_DATABASE").unwrap_or_else(|_| String::from("wtmm.db"));
    let c = rusqlite::Connection::open(name)?;
    c.pragma_update(None, "foreign_keys", "ON")?;

    Ok(c)
}

pub fn repeat_vars(count: usize) -> String {
    if count == 0 {
        return String::from("");
    }
    let mut s = "?,".repeat(count);
    // Remove trailing comma
    s.pop();
    s
}
