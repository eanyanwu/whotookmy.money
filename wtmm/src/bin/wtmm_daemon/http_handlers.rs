use std::io::{empty};
use tiny_http::{Request, Response, ResponseBox};
use wtmm::db;
use wtmm::email::PostmarkInboundEmail;
use wtmm::error_handling::print_error_chain;
use wtmm::route_inbound_email;
use wtmm::store::Store;
use wtmm::url_match::UrlMatchResult;

/// Construct an empty HTTP response with a status code
pub fn empty_response(status: u32) -> ResponseBox {
    Response::new(status.into(), vec![], Box::new(empty()), Some(0), None)
}

pub fn postmark(_: UrlMatchResult, req: &mut Request) -> ResponseBox {
    let mut buf = String::new();

    if let Err(_) = req.as_reader().read_to_string(&mut buf) {
        // Assumption: Postmark will only send us valid request bodies
        tracing::warn!("couldn't read request body.");
        empty_response(400)
    } else {
        if let Ok(p) = serde_json::from_str::<PostmarkInboundEmail>(&buf) {
            let c = db::get_connection().expect("could not connect to db");
            let store = Store::from(c);

            if let Err(e) = route_inbound_email(&p.raw_email, store) {
                print_error_chain(&e);
            }
            // Respond to valid postmark emails with a 200 regardless of outcome
            empty_response(200)
        } else {
            // Assumption: Postmark will only send us valid json.
            tracing::warn!("could not parse request body as json");
            empty_response(400)
        }
    }
}
