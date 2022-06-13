use std::error;
use std::thread;
use std::time;
use tracing::info;
use tracing_subscriber;
use wtmm::send_email;
use wtmm::store::Store;
use wtmm::{db, error_handling::print_error_chain};

fn run_app() -> Result<(), Box<dyn error::Error>> {
    let mut c = db::get_connection()?;
    db::init(&mut c)?;
    let store = Store::from(c);

    info!("polling for outstanding emails");
    loop {
        for (id, email) in store.unsent_emails()? {
            info!(outbound_email_id = id, "sending email");
            let res = send_email(id, &email, &store);

            match res {
                Ok(_) => (),
                Err(e) => {
                    print_error_chain(&e);
                }
            };
            thread::sleep(time::Duration::from_secs(10));
        }
        thread::sleep(time::Duration::from_secs(10));
    }
}

fn main() {
    tracing_subscriber::fmt::init();
    std::process::exit(match run_app() {
        Ok(_) => 0,
        Err(e) => {
            print_error_chain(e.as_ref());
            1
        }
    });
}
