use tracing::error;

pub fn print_error_chain(e: &dyn std::error::Error) {
    error!("{}", e);
    let mut current = e.source();
    while let Some(cause) = current {
        error!("\nCaused by:\n\t{}", cause);
        current = cause.source();
    }
}
