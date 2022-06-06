use std::error;
use std::str::FromStr;
use tiny_http::{Method, Response, Server};
use tracing::info;
use tracing_subscriber;
use wtmm::db;
use wtmm::email::PostmarkInboundEmail;
use wtmm::email::{get_bank_alert_email, Email};
use wtmm::error_handling::print_error_chain;
use wtmm::purchase::Purchase;
use wtmm::store::Store;

fn route_email(email: PostmarkInboundEmail) -> Result<(), Box<dyn error::Error>> {
    let email = Email::try_from(email.raw_email)?;
    let mut c = db::get_connection()?;
    db::init(&mut c)?;
    let store = Store::from(c);

    if matches!(email.get_body(), Some(b) if b.contains(&get_bank_alert_email())) {
        let purchase = Purchase::try_from(&email)?;
        store.save_purchase(&purchase)?;
    } else {
        return Err(format!("no route registered for email: {}", email.get_to()).into());
    }

    Ok(())
}

fn main() {
    tracing_subscriber::fmt::init();

    let port = std::env::var("PORT").expect("missing PORT env var");
    let port = u16::from_str(port.as_ref()).expect("PORT should be a valid 16 bit integer");

    let server = Server::http(("127.0.0.1", port)).expect("could not bind to PORT");

    info!("listening on port {}", port);

    for mut req in server.incoming_requests() {
        let status: u16 = match (req.method(), req.url()) {
            (Method::Post, "/") => {
                let mut buf = String::new();

                if let Err(_) = req.as_reader().read_to_string(&mut buf) {
                    // Assumption: Postmark will only send us valid request bodies
                    tracing::warn!("couldn't read request body.");
                    400
                } else {
                    if let Ok(p) = serde_json::from_str::<PostmarkInboundEmail>(&buf) {
                        if let Err(e) = route_email(p) {
                            print_error_chain(e.as_ref());
                        }
                        // Respond to valid postmark emails with a 200 regardless of outcome
                        200
                    } else {
                        // Assumption: Postmark will only send us valid json.
                        tracing::warn!("could not parse request body as json");
                        400
                    }
                }
            }
            _ => 404,
        };
        info!("{} {} {}", req.method(), req.url(), status);
        req.respond(Response::empty(status)).ok();
    }
}
