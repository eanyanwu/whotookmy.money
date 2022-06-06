use crate::db::RowId;
use crate::outbound_email::OutboundEmail;
use crate::store::Store;
use std::env;
use thiserror::Error;
use ureq;

#[derive(Debug, Error)]
#[error("could not send email")]
pub struct SendEmailError(String);

pub fn send_email(id: RowId, email: &OutboundEmail, store: &Store) -> Result<(), SendEmailError> {
    let postmark_token =
        env::var("POSTMARK_API_TOKEN").expect("missing POSTMARK_API_TOKEN env var");

    let json = format!(
        r#"{{
        "From": "{from}",
        "To": "{to}",
        "Subject": "{subject}",
        "TextBody": "{body}"
        }}"#,
        from = email.get_from(),
        to = email.get_to(),
        subject = email.get_subject(),
        body = email.get_body(),
    );

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

            Err(SendEmailError(error))
        }
        Err(e) => Err(SendEmailError(format!("network error: {}", e))),
    }
}

#[cfg(test)]
mod test {
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
    fn test_send_email() {
        let store = setup();
        let c = store.handle();

        env::set_var("POSTMARK_API_TOKEN", "POSTMARK_API_TEST");
        c.execute_batch(
            "INSERT INTO user(user_email)
            VALUES ('person@example.org');

            INSERT INTO outbound_email(user_id, subject, body, sent_at)
            VALUES (1, 'Test', 'Test', NULL);",
        )
        .unwrap();

        let (id, email) = store.unsent_emails().unwrap().pop().unwrap();

        send_email(id, &email, &store).unwrap();

        let emails = store.unsent_emails().unwrap();

        assert_eq!(emails.len(), 0);
    }
}
