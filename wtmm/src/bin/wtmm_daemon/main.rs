use std::str::FromStr;
use tiny_http::{Request, ResponseBox, Server};
use tracing::info;
use tracing_subscriber;
use wtmm::url_match::{matches, UrlMatchResult, UrlPattern};

mod http_handlers;
use http_handlers::{empty_result, income_form, postmark};

fn main() {
    tracing_subscriber::fmt::init();

    let port = std::env::var("PORT").expect("missing PORT env var");
    let port = u16::from_str(port.as_ref()).expect("PORT should be a valid 16 bit integer");

    let server = Server::http(("127.0.0.1", port)).expect("could not bind to PORT");

    info!("listening on port {}", port);

    // Routing
    let routes: Vec<(UrlPattern, fn(UrlMatchResult, &mut Request) -> ResponseBox)> = vec![
        (UrlPattern::new("POST/"), postmark),
        (UrlPattern::new("GET/income/:id"), income_form),
    ];

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
