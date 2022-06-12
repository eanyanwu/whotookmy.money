use std::io::empty;
use std::str::FromStr;
use tiny_http::{Request, Response, ResponseBox, Server};
use tracing::info;
use tracing_subscriber;
use wtmm::db;
use wtmm::email::PostmarkInboundEmail;
use wtmm::error_handling::print_error_chain;
use wtmm::route_inbound_email;
use wtmm::store::Store;
use wtmm::url_match::{matches, UrlMatchResult, UrlPattern};

// Construct an empty HTTP response with a status code s
fn empty_result(status: u32) -> ResponseBox {
    Response::new(status.into(), vec![], Box::new(empty()), Some(0), None)
}

fn postmark_email_webhook(_: UrlMatchResult, req: &mut Request) -> ResponseBox {
    let mut buf = String::new();

    if let Err(_) = req.as_reader().read_to_string(&mut buf) {
        // Assumption: Postmark will only send us valid request bodies
        tracing::warn!("couldn't read request body.");
        empty_result(400)
    } else {
        if let Ok(p) = serde_json::from_str::<PostmarkInboundEmail>(&buf) {
            let mut c = db::get_connection().expect("could not connect to db");
            db::init(&mut c).expect("could not initialize connection");
            let store = Store::from(c);

            if let Err(e) = route_inbound_email(&p.raw_email, store) {
                print_error_chain(&e);
            }
            // Respond to valid postmark emails with a 200 regardless of outcome
            empty_result(200)
        } else {
            // Assumption: Postmark will only send us valid json.
            tracing::warn!("could not parse request body as json");
            empty_result(400)
        }
    }
}

fn main() {
    tracing_subscriber::fmt::init();

    let port = std::env::var("PORT").expect("missing PORT env var");
    let port = u16::from_str(port.as_ref()).expect("PORT should be a valid 16 bit integer");

    let server = Server::http(("127.0.0.1", port)).expect("could not bind to PORT");

    info!("listening on port {}", port);

    // Routing
    let routes: Vec<(UrlPattern, fn(UrlMatchResult, &mut Request) -> ResponseBox)> =
        vec![(UrlPattern::new("POST/"), postmark_email_webhook)];

    for mut req in server.incoming_requests() {
        let mut res = empty_result(400);
        for (pattern, handler) in routes.iter() {
            let url = format!("{}{}", req.method(), req.url());
            if let Some(route_result) = matches(&url, &pattern) {
                res = handler(route_result, &mut req);
                break;
            }
        }
        info!("{} {} {}", req.method(), req.url(), res.status_code().0);
        req.respond(res).ok();
    }
}
