pub mod currency;
pub mod db;
pub mod email;
pub mod error_handling;
pub mod hooks;
pub mod outbound_email;
pub mod purchase;
pub mod report;
pub mod scheduler;
pub mod store;
pub mod templates;
pub mod url_match;
pub mod user;

use crate::templates::{IncomeFormEmailHtmlTemplate, IncomeFormEmailTextTemplate};
use askama::Template;
use chrono::{TimeZone, Utc};
use db::RowId;
use email::{get_bank_alert_email, get_domain, get_income_email, Email};
use outbound_email::OutboundEmail;
use purchase::Purchase;
use scheduler::{ScheduledJob, ScheduledJobError};
use std::env;
use store::{Store, StoreError};
use thiserror::Error;

#[derive(Debug, Error)]
#[error("could not send email")]
pub struct SendEmailError(#[source] Box<dyn std::error::Error>);

#[derive(Error, Debug)]
pub enum InboundEmailError {
    #[error("error handling email")]
    ProcessingError(#[source] Box<dyn std::error::Error>),
    #[error("could not route email")]
    RoutingError,
}

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
            Some(&report.get_text_body().unwrap_or_default()),
            None,
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

pub fn send_email(id: RowId, email: &OutboundEmail, store: &Store) -> Result<(), SendEmailError> {
    let postmark_token =
        env::var("POSTMARK_API_TOKEN").expect("missing POSTMARK_API_TOKEN env var");

    let json = format!(
        r#"{{
        "From": "{from}",
        "To": "{to}",
        "Subject": "{subject}",
        "TextBody": "{body}",
        "HtmlBody": "{body_html}"
        }}"#,
        from = email.get_from(),
        to = email.get_to(),
        subject = email.get_subject().as_bytes().escape_ascii().to_string(),
        body = email.get_body().as_bytes().escape_ascii().to_string(),
        body_html = email.get_body_html().as_bytes().escape_ascii().to_string(),
    );
    println!("{json}");

    let res = ureq::post("https://api.postmarkapp.com/email")
        .set("X-Postmark-Server-Token", &postmark_token)
        .set("Content-Type", "application/json")
        .send_string(&json);

    // Set the email as sent regardless of what the result was
    // Since email is such a fickle medium, it's wise to overcompensate
    // and make sure there is as little chance of sending too many emails
    store.mark_email_sent(id);

    match res {
        Ok(_) => Ok(()),
        Err(ureq::Error::Status(code, response)) => {
            let status_text = response.status_text().to_string();

            // Assumption: Postmark error messages are not bigger than 10 MB
            let error = response.into_string().unwrap();

            let error = format!("{} {}\n{}", code, status_text, error);

            Err(SendEmailError(error.into()))
        }
        Err(e) => Err(SendEmailError(format!("network error: {}", e).into())),
    }
}
/// Handle all inbound postmark emails
pub fn route_inbound_email<S: AsRef<Store>>(
    raw_email: &str,
    store: S,
) -> Result<(), InboundEmailError> {
    let store = store.as_ref().clone();

    let parsed = Email::try_from(raw_email).map_err(|e| {
        tracing::error!("could not parse inbound email");
        InboundEmailError::ProcessingError(Box::new(e))
    })?;

    let msgid = parsed.get_message_id().unwrap_or("[no-message-id]");

    if parsed.get_to() == get_income_email() {
        // User emailed income@ to receive a link to the page where
        // they can input income information
        let (_, token) = store.create_session_token(parsed.get_from()).map_err(|e| {
            tracing::error!(msgid, "error creating session token");
            InboundEmailError::ProcessingError(Box::new(e))
        })?;
        // Create a special link for the user to input income
        let link = format!("https://{}/income/{}", get_domain(), token);

        let html_template = IncomeFormEmailHtmlTemplate { link: link.clone() };
        let text_template = IncomeFormEmailTextTemplate { link: link.clone() };

        let outbound_email = OutboundEmail::new(
            parsed.get_from(),
            Some("Your Income Form"),
            text_template.render().ok().as_deref(),
            html_template.render().ok().as_deref(),
        );

        store.queue_email(&outbound_email).ok();
    } else if parsed.get_from() == "forwarding-noreply@google.com" { 
        
    } else if raw_email.contains(&get_bank_alert_email()) {
        let purchase = Purchase::try_from(&parsed).map_err(|e| {
            tracing::error!(msgid, "error parsing email as purchase");
            InboundEmailError::ProcessingError(Box::new(e))
        })?;

        store.save_purchase(&purchase).map_err(|e| {
            tracing::error!(msgid, "error saving purchase to database");
            InboundEmailError::ProcessingError(Box::new(e))
        })?;

        let (user_id, _) = store.get_or_create_user(parsed.get_to()).map_err(|e| {
            tracing::error!(msgid, "error fetching user to update timezone");
            InboundEmailError::ProcessingError(Box::new(e))
        })?;
        store.set_user_tz_offset(user_id, parsed.get_tz_offset());
    } else {
        tracing::warn!(msgid, "failed to route email");
        return Err(InboundEmailError::RoutingError);
    }

    Ok(())
}

#[cfg(test)]
mod route_inbound_email_test {
    use super::route_inbound_email;
    use crate::db;
    use crate::report::ReportType;
    use crate::store::Store;
    use rusqlite::Connection;
    use std::fs;

    fn setup() -> Store {
        let mut conn = Connection::open(":memory:").unwrap();
        db::init(&mut conn).unwrap();
        Store::from(conn)
    }

    #[test]
    fn test_route_inbound_schwab_email() {
        let store = setup();
        let c = store.handle();

        let schwab_email = fs::read_to_string("./test_assets/schwab_alert").unwrap();
        route_inbound_email(&schwab_email, &store).unwrap();

        let (email, tz_offset): (String, i32) = c
            .query_row("SELECT user_email, tz_offset FROM user", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .unwrap();

        let report_type: ReportType = c
            .query_row("SELECT report_type FROM user_report", [], |r| r.get(0))
            .unwrap();

        let purchase_count: usize = c
            .query_row("SELECT count(*) FROM purchase", [], |r| r.get(0))
            .unwrap();

        assert_eq!(email, "hello@ezeanyinabia.com");
        assert_eq!(tz_offset, -14_400);
        assert_eq!(report_type, ReportType::PurchaseDigest);
        assert_eq!(purchase_count, 1);
    }

    #[test]
    fn test_route_inbound_chase_email() {
        let store = setup();
        let c = store.handle();

        let chase_email = fs::read_to_string("./test_assets/chase_alert").unwrap();
        route_inbound_email(&chase_email, &store).unwrap();

        let (email, tz_offset): (String, i32) = c
            .query_row("SELECT user_email, tz_offset FROM user", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .unwrap();

        let report_type: ReportType = c
            .query_row("SELECT report_type FROM user_report", [], |r| r.get(0))
            .unwrap();

        let purchase_count: usize = c
            .query_row("SELECT count(*) FROM purchase", [], |r| r.get(0))
            .unwrap();

        assert_eq!(email, "hello@ezeanyinabia.com");
        assert_eq!(tz_offset, -14_400);
        assert_eq!(report_type, ReportType::PurchaseDigest);
        assert_eq!(purchase_count, 1);
    }

    #[test]
    fn test_route_email_income_form() {
        let store = setup();
        let c = store.handle();

        let income_form_request = fs::read_to_string("./test_assets/income_form_request").unwrap();
        route_inbound_email(&income_form_request, &store).unwrap();

        // A session token should have been created
        let token: String = c
            .query_row("SELECT session_token FROM session", [], |r| r.get(0))
            .unwrap();

        // This session token  should have been used to create an email
        let (body, body_html): (String, String) = c
            .query_row("SELECT body, body_html FROM outbound_email", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .unwrap();

        assert!(body.contains(&token));
        assert!(body_html.contains(&token));
    }
}

#[cfg(test)]
mod report_job_test {
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

        assert!(body.contains("No transactions"));
    }
}

#[cfg(test)]
mod send_email_test {
    use super::send_email;
    use crate::db;
    use crate::store::Store;
    use std::env;
    fn setup() -> Store {
        let mut c = rusqlite::Connection::open(":memory:").unwrap();
        db::init(&mut c).unwrap();
        Store::from(c)
    }

    #[test]
    fn test_send_email_bank_alert() {
        let store = setup();
        let c = store.handle();

        env::set_var("POSTMARK_API_TOKEN", "POSTMARK_API_TEST");
        c.execute_batch(
            "INSERT INTO user(user_email)
            VALUES ('person@example.org');

            INSERT INTO outbound_email(user_id, subject, body, body_html, sent_at)
            VALUES (1, 'Test', 'Test', '<html>TEST</html>', NULL);",
        )
        .unwrap();

        let (id, email) = store.unsent_emails().unwrap().pop().unwrap();

        send_email(id, &email, &store).unwrap();

        let emails = store.unsent_emails().unwrap();

        assert_eq!(emails.len(), 0);
    }
}
