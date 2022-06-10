use crate::db::RowId;
use crate::outbound_email::OutboundEmail;
use crate::purchase::Purchase;
use crate::report::{PurchaseDigest, Report, ReportDefinition};
use crate::user::User;
use chrono::Utc;
use rusqlite::{named_params, params, Connection};
use std::rc::Rc;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum StoreError {
    #[error("database error: {0}")]
    DatabaseError(&'static str, #[source] rusqlite::Error),
    #[error("error queueing email. too many emails queued")]
    TooManyEmails,
}
/// Abstraction on top of the database.
///
/// Contains all the logic for mapping our concrete types into table rows and
/// vice-versa
#[derive(Clone)]
pub struct Store {
    database: Rc<Connection>,
}

impl From<Connection> for Store {
    /// Create a Store object from a rusqlite Connection
    fn from(input: Connection) -> Self {
        Self {
            database: Rc::new(input),
        }
    }
}

impl From<Rc<Connection>> for Store {
    /// Create a Store object from a reference counted pointer to a
    /// rusqlite connection
    fn from(input: Rc<Connection>) -> Self {
        Self { database: input }
    }
}

impl AsRef<Store> for Store {
    fn as_ref(&self) -> &Self {
        self
    }
}

impl Store {
    /// Returns an owned handle to the database connection. Useful for testing
    pub fn handle(&self) -> Rc<Connection> {
        self.database.clone()
    }

    /// Creates a new user with the given email if one does not exist.
    /// Automatically set them up with a purchase digest report
    ///
    /// This function is idempotent
    pub fn get_or_create_user(&self, email: &str) -> Result<(RowId, User), StoreError> {
        let c = &self.database;

        c.execute(
            "INSERT INTO user (user_email)
            VALUES (?)
            ON CONFLICT DO NOTHING",
            [email],
        )
        .map_err(|e| StoreError::DatabaseError("inserting user", e))?;

        // safe unwrap as we just created the user
        let (user_id, user) = c
            .query_row(
                "SELECT user_id, user_email, tz_offset
            FROM user
            WHERE user_email = ?",
                [email],
                |r| {
                    let user_id = r.get::<_, RowId>(0)?;
                    let user_email = r.get::<_, String>(1)?;
                    let tz_offset = r.get::<_, i32>(2)?;
                    Ok((user_id, User::new(&user_email, tz_offset)))
                },
            )
            .unwrap();

        c.execute(
            "INSERT INTO user_report (user_id, report_type, schedule)
            VALUES (?, ?, ?)
            ON CONFLICT DO NOTHING",
            params![user_id, "PURCHASE_DIGEST", "0 0 12 * * ?"],
        )
        .map_err(|e| StoreError::DatabaseError("inserting user report", e))?;

        Ok((user_id, user))
    }

    /// Sets the user's timezone offset
    ///
    /// This function is idempotent
    pub fn set_user_tz_offset(&self, user_id: RowId, tz_offset: i32) {
        let c = &self.database;

        c.execute(
            "UPDATE user
            SET tz_offset = ? WHERE user_id = ?",
            params![tz_offset, user_id],
        )
        .ok();
    }

    /// Save a purchase
    pub fn save_purchase(&self, p: &Purchase) -> Result<RowId, StoreError> {
        let c = &self.database;
        let (user_id, _) = self.get_or_create_user(p.get_user_email())?;

        let mut stmt = c
            .prepare(
                "INSERT INTO purchase (user_id, amount_in_cents, merchant, timestamp)
            VALUES (:user_id, :amount_in_cents, :merchant, :timestamp)",
            )
            .unwrap();

        let purchase_id = stmt
            .insert(named_params! {
                ":user_id": user_id,
                ":amount_in_cents": p.get_amount_in_cents(),
                ":merchant": p.get_merchant(),
                ":timestamp": p.get_timestamp(),
            })
            .map_err(|e| StoreError::DatabaseError("inserting purchase", e))?;

        Ok(purchase_id)
    }

    /// Returns all the currently unsent emails
    pub fn unsent_emails(&self) -> Result<Vec<(RowId, OutboundEmail)>, StoreError> {
        let c = &self.database;

        let mut stmt = c
            .prepare(
                "SELECT outbound_email_id, user.user_email, subject, body
            FROM outbound_email
            INNER JOIN user
            ON user.user_id = outbound_email.user_id
            WHERE outbound_email.sent_at is NULL
            LIMIT 1",
            )
            .unwrap();

        let unsent = stmt
            .query_map([], |r| {
                let destination = r.get::<_, String>(1)?;
                let subject = r.get::<_, Option<String>>(2)?;
                let body = r.get::<_, Option<String>>(3)?;
                let id = r.get::<_, RowId>(0)?;
                Ok((
                    id,
                    OutboundEmail::new(&destination, subject.as_deref(), body.as_deref()),
                ))
            })
            .unwrap();

        unsent
            .collect::<Result<Vec<(RowId, OutboundEmail)>, rusqlite::Error>>()
            .map_err(|e| StoreError::DatabaseError("unsent emails", e))
    }

    /// Mark the outbound email associated with the given id as sent
    ///
    /// This function is idempotent
    pub fn mark_email_sent(&self, id: RowId) {
        let c = &self.database;

        c.execute(
            "UPDATE outbound_email
            SET sent_at = strftime('%s')
            WHERE outbound_email_id = ?",
            [id],
        )
        .ok();
    }

    /// Queue an email to be sent
    ///
    /// # Failure
    ///
    /// This method will fail if the user already has one unsent email or if
    /// we have sent them an email in the past 5 minutes
    pub fn queue_email(&self, e: &OutboundEmail) -> Result<RowId, StoreError> {
        let c = &self.database;

        let (user_id, _) = self.get_or_create_user(e.get_to())?;

        let count_unsent = c
            .query_row(
                "SELECT count(*)
            FROM outbound_email
            INNER JOIN user
            ON outbound_email.user_id = user.user_id
            WHERE user.user_email = ? AND (
                outbound_email.sent_at IS NULL
                OR strftime('%s') - sent_at < 300
            )",
                [e.get_to()],
                |r| r.get::<_, u64>(0),
            )
            .map_err(|e| StoreError::DatabaseError("checking for sent emails", e))?;

        if count_unsent > 0 {
            Err(StoreError::TooManyEmails)
        } else {
            let mut stmt = c
                .prepare(
                    "INSERT INTO outbound_email (user_id, subject, body)
                VALUES (?, ?, ?)",
                )
                .unwrap();

            let email_id = stmt
                .insert(params![user_id, e.get_subject(), e.get_body()])
                .map_err(|e| StoreError::DatabaseError("inserting outbound email", e))?;

            Ok(email_id)
        }
    }

    /// Returns the the report definition with the given id
    pub fn get_report_definition(&self, id: RowId) -> Result<ReportDefinition, StoreError> {
        let c = &self.database;
        c.query_row(
            "SELECT
                u.user_email,
                ur.report_type,
                ur.schedule,
                ur.created_at
            FROM user_report as ur
            INNER JOIN user as u
            ON ur.user_id = u.user_id
            WHERE user_report_id = ?",
            [id],
            |r| {
                let def = ReportDefinition::try_from(r)?;

                Ok(def)
            },
        )
        .map_err(|e| StoreError::DatabaseError("report lookup", e))
    }

    /// Returns all report definitions
    pub fn report_definitions(&self) -> Result<Vec<(RowId, ReportDefinition)>, StoreError> {
        let c = &self.database;

        let mut stmt = c
            .prepare(
                "SELECT
                u.user_email,
                ur.report_type,
                ur.schedule,
                ur.created_at,
                ur.user_report_id
            FROM user_report as ur
            INNER JOIN user as u
            ON u.user_id = ur.user_id",
            )
            .unwrap();

        let res = stmt
            .query_map([], |r| {
                let user_report_id = r.get::<_, RowId>(4)?;
                let def = ReportDefinition::try_from(r)?;

                Ok((user_report_id, def))
            })
            .unwrap();

        res.collect::<Result<Vec<(RowId, ReportDefinition)>, rusqlite::Error>>()
            .map_err(|e| StoreError::DatabaseError("report definition", e))
    }

    /// Returns the timestamp at which the last report was sent. None if we
    /// haven't sent an email with the given report yet.
    pub fn last_report_date(&self, id: RowId) -> Option<i64> {
        let c = &self.database;

        c.query_row(
            "SELECT MAX(o.sent_at)
            FROM outbound_email as o
            INNER JOIN user_report_outbound_email as u
            ON u.outbound_email_id = o.outbound_email_id
            WHERE u.user_report_id = ?",
            [id],
            |r| r.get::<_, Option<i64>>(0),
        )
        .ok()
        .flatten()
    }

    /// Runs the given report
    pub fn run_report(&self, id: RowId) -> Result<Report, StoreError> {
        let c = &self.database;

        let (user_id, report) = c
            .query_row(
                "SELECT
                u.user_email,
                ur.report_type,
                ur.schedule,
                ur.created_at,
                ur.user_id
            FROM user_report as ur
            INNER JOIN user as u
            ON ur.user_id = u.user_id
            WHERE user_report_id = ?",
                [id],
                |r| {
                    let user_id = r.get::<_, RowId>(4)?;
                    let def = ReportDefinition::try_from(r)?;

                    Ok((user_id, def))
                },
            )
            .map_err(|e| StoreError::DatabaseError("report lookup", e))?;

        let period_start = self.last_report_date(id).unwrap_or(report.get_created_at());
        let period_end = Utc::now().timestamp();

        // Purchases by cost
        let mut stmt = c
            .prepare(
                "SELECT
                u.user_email,
                p.amount_in_cents,
                p.merchant,
                p.timestamp
            FROM purchase as p
            INNER JOIN user as u
            ON u.user_id = p.user_id
            WHERE u.user_id = ? AND p.timestamp > ?
            ORDER BY p.amount_in_cents DESC",
            )
            .unwrap();

        let purchase_by_cost = stmt
            .query_map(params![user_id, period_start], |r| Purchase::try_from(r))
            .unwrap();

        let purchase_by_cost = purchase_by_cost
            .collect::<Result<Vec<Purchase>, rusqlite::Error>>()
            .map_err(|e| StoreError::DatabaseError("purchase by cost", e))?;

        Ok(Report::PurchaseDigest(PurchaseDigest::new(
            purchase_by_cost,
            period_start,
            period_end,
        )))
    }

    /// Mark a report as sent
    ///
    /// This function is idempotent
    pub fn mark_report_sent(&self, report_definition_id: RowId, outbound_email_id: RowId) {
        let c = &self.handle();

        // If we try to re-insert, we'll fail because of database constraints.
        c.execute(
            "INSERT INTO user_report_outbound_email (user_report_id, outbound_email_id)
            VALUES (?, ?)",
            [report_definition_id, outbound_email_id],
        )
        .ok();
    }
}

#[cfg(test)]
mod test {
    use super::Store;
    use crate::db;
    use crate::outbound_email::OutboundEmail;
    use crate::purchase::Purchase;
    use crate::report::Report;

    fn setup() -> Store {
        let mut db = rusqlite::Connection::open(":memory:").unwrap();
        db::init(&mut db).unwrap();
        Store::from(db)
    }

    #[test]
    fn test_set_tz_offset() {
        let store = setup();
        let c = store.handle();

        c.execute_batch(
            "INSERT INTO user (user_email)
            VALUES ('person@example.org');",
        )
        .unwrap();

        let default_offset = c
            .query_row("SELECT tz_offset FROM user WHERE user_id = 1", [], |r| {
                r.get::<_, i32>(0)
            })
            .unwrap();

        assert_eq!(default_offset, 0);

        store.set_user_tz_offset(1, 60);

        let offset = c
            .query_row("SELECT tz_offset FROM user WHERE user_id = 1", [], |r| {
                r.get::<_, i32>(0)
            })
            .unwrap();

        assert_eq!(offset, 60);
    }

    #[test]
    fn test_updating_unsent_emails() {
        let store = setup();
        let c = store.handle();

        // insert two outbound emails
        c.execute_batch(
            "INSERT INTO user (user_email)
            VALUES ('person@example.org');

            INSERT INTO outbound_email (user_id, subject, body, sent_at)
            SELECT  1, 'Old', 'Old', 1
            UNION
            SELECT 1, 'New', 'New', NULL",
        )
        .unwrap();

        let mut unsent = store.unsent_emails().unwrap();

        assert_eq!(unsent.len(), 1);

        let (id, email) = unsent.pop().unwrap();

        assert_eq!(email.get_subject(), "New");
        assert_eq!(email.get_body(), "New");

        store.mark_email_sent(id);

        let unsent = store.unsent_emails().unwrap();

        assert_eq!(unsent.len(), 0);
    }

    #[test]
    fn test_queue_email() {
        let store = setup();
        let c = store.handle();

        // create a user
        c.execute_batch(
            "INSERT INTO USER (user_email)
            VALUES ('person@example.org')",
        )
        .unwrap();

        // create an email
        let email = OutboundEmail::new("person@example.org", Some("Hello"), Some("Bye"));
        store.queue_email(&email).unwrap();

        let count = c
            .query_row("SELECT count(*) FROM outbound_email", [], |r| {
                r.get::<_, u64>(0)
            })
            .unwrap();

        assert_eq!(count, 1);

        let fail = store.queue_email(&email);

        assert_eq!(fail.is_err(), true);

        c.execute_batch("UPDATE outbound_email SET sent_at = strftime('%s')")
            .unwrap();

        let fail = store.queue_email(&email);

        assert_eq!(fail.is_err(), true);

        c.execute_batch("UPDATE outbound_email SET sent_at = strftime('%s') - 301")
            .unwrap();

        store.queue_email(&email).unwrap();

        let count = c
            .query_row("SELECT count(*) FROM outbound_email", [], |r| {
                r.get::<_, u64>(0)
            })
            .unwrap();

        assert_eq!(count, 2);
    }
    #[test]
    fn test_run_report_no_purchases() {
        let store = setup();
        let c = store.handle();

        c.execute_batch(
            "INSERT INTO user(user_email)
            VALUES ('person@example.org');

            INSERT INTO user_report(user_id, report_type, schedule)
            VALUES (1, 'PURCHASE_DIGEST', '* * * * * ?');",
        )
        .unwrap();

        let report = store.run_report(1).unwrap();

        let validate_cost = |c: &[Purchase]| c.len() == 0;

        assert!(matches!(
            report,
            Report::PurchaseDigest(d)
            if validate_cost(d.get_purchases())
        ));
    }

    #[test]
    fn test_run_report() {
        let store = setup();
        let c = store.handle();

        c.execute_batch(
            "INSERT INTO user(user_email)
            VALUES ('person@example.org');

            INSERT INTO user_report(user_id, report_type, schedule)
            VALUES (1, 'PURCHASE_DIGEST', '* * * * * ?');

            INSERT INTO outbound_email(user_id, subject, body, sent_at)
            VALUES (1, 'Subject', 'Body', 2);
            INSERT INTO user_report_outbound_email (user_report_id, outbound_email_id)
            VALUES (1, 1);

            INSERT INTO purchase(user_id, amount_in_cents, merchant, timestamp)
            VALUES
            (1, 100, 'FOOD', 2),
            (1, 100, 'FOOD', 3),
            (1, 300, 'FOOD', 5),
            (1, 1000, 'AIRBNB', 5);",
        )
        .unwrap();

        let report = store.run_report(1).unwrap();

        // Validate that:
        // (a) Only three purchases were included (because the first one appears in a previous report)
        // (b) The purchases are sorted
        let validate_purchases =
            |c: &[Purchase]| c.len() == 3 && c.get(0).unwrap().get_amount_in_cents() == 1000;

        assert!(matches!(
            report,
            Report::PurchaseDigest(d)
            if validate_purchases(d.get_purchases()) && d.get_period_start() == 2
        ));
    }
}
