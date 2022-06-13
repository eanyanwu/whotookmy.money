use askama::Template;
use std::io::{empty, Cursor};
use tiny_http::{Request, Response, ResponseBox};
use wtmm::db;
use wtmm::email::PostmarkInboundEmail;
use wtmm::error_handling::print_error_chain;
use wtmm::route_inbound_email;
use wtmm::store::Store;
use wtmm::url_match::UrlMatchResult;

/// Construct an empty HTTP response with a status code
pub fn empty_result(status: u32) -> ResponseBox {
    Response::new(status.into(), vec![], Box::new(empty()), Some(0), None)
}

#[derive(Template)]
#[template(path = "income_form.html")]
struct IncomeForm {
    id: &'static str,
}

pub fn income_form(match_result: UrlMatchResult, _req: &mut Request) -> ResponseBox {
    let _user_id = match_result.get_path_variables()[0];
    let template = IncomeForm { id: "0123" };
    let html = template.render().unwrap();
    let html_len = html.len();
    Response::new(
        200u32.into(),
        vec![],
        Box::new(Cursor::new(html.into_bytes())),
        Some(html_len),
        None,
    )
}

pub fn postmark(_: UrlMatchResult, req: &mut Request) -> ResponseBox {
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
