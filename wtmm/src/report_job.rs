use crate::db::RowId;
use crate::outbound_email::OutboundEmail;
use crate::scheduler::{ScheduledJob, ScheduledJobError};
use crate::store::{Store, StoreError};
use chrono::{TimeZone, Utc};
use thiserror::Error;

#[derive(Debug, Error)]
#[error("error creating report job")]
pub struct CreateReportJobError(#[from] StoreError);

/// Create a Scheduled job from the given report
pub fn report_job<S: AsRef<Store>>(
    report_def_id: RowId,
    store: S,
) -> Result<ScheduledJob, CreateReportJobError> {
    let store = store.as_ref().clone();
    let report_def = store.get_report_definition(report_def_id).map_err(|e| {
        tracing::error!(id = report_def_id, "could not crate report job");
        e
    })?;
    let schedule = report_def.get_schedule().clone();
    let user_email = report_def.get_user_email().to_string();
    let last_report_date = store
        .last_report_date(report_def_id)
        .unwrap_or(report_def.get_created_at());

    let mut job = ScheduledJob::new(schedule, move || {
        let report = store
            .run_report(report_def_id)
            .map_err(|e| ScheduledJobError(Box::new(e)))?;
        let email = OutboundEmail::new(
            &user_email,
            Some(&report.get_subject()),
            Some(&report.get_body()),
        );

        let email_id = store
            .queue_email(&email)
            .map_err(|e| ScheduledJobError(Box::new(e)))?;

        store.mark_report_sent(report_def_id, email_id);
        Ok(())
    });
    job.starting_from(Some(Utc.timestamp(last_report_date, 0)));
    Ok(job)
}

#[cfg(test)]
mod test {
    use super::report_job;
    use crate::db;
    use crate::store::Store;

    fn setup() -> Store {
        let mut c = rusqlite::Connection::open(":memory:").unwrap();
        db::init(&mut c).unwrap();
        let store = Store::from(c);
        store
    }

    #[test]
    fn test_report_job() {
        let store = setup();
        let c = store.handle();

        c.execute_batch(
            "INSERT INTO user(user_email)
            VALUES ('person@example.org');

            INSERT INTO user_report(user_id, report_type, schedule, created_at)
            VALUES (1, 'PURCHASE_DIGEST', '* * * * * ?', 1);
            ",
        )
        .ok();

        let mut job = report_job(1, Box::new(store)).unwrap();

        job.tick();

        // We should have created a report and queued an email to be cent
        let (_, body) = c
            .query_row("SELECT subject, body FROM outbound_email", [], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
            })
            .unwrap();

        assert!(body.contains("$0.00"));
    }
}
