use std::collections::hash_map::RandomState;
use std::collections::{HashMap, HashSet};
use std::error::Error;
use std::sync::Arc;
use std::thread;
use std::time;
use tracing::info;
use tracing_subscriber;
use uuid::Uuid;
use wtmm::db;
use wtmm::error_handling::print_error_chain;
use wtmm::report_job;
use wtmm::scheduler::JobRunner;
use wtmm::store::Store;

fn run_app() -> Result<(), Box<dyn Error>> {
    let mut c = db::get_connection()?;
    db::init(&mut c).ok();
    let store = Arc::new(Store::from(c));
    let mut active_job_map: HashMap<db::RowId, Uuid> = HashMap::new();

    let mut runner = JobRunner::new();

    info!("polling for user reports definitions to run");
    loop {
        let report_defs = store.report_definitions()?;
        let report_defs: HashMap<_, _, RandomState> = HashMap::from_iter(report_defs);

        let report_def_ids: HashSet<i64, RandomState> =
            HashSet::from_iter(report_defs.keys().copied());
        let active_report_def_ids: HashSet<i64, RandomState> =
            HashSet::from_iter(active_job_map.keys().copied());

        // create new jobs for reports that have not been scheduled
        for new_report_id in report_def_ids.difference(&active_report_def_ids).copied() {
            info!(report_id = new_report_id, "new user report detected");

            let job = report_job(new_report_id, &store)?;

            active_job_map.insert(new_report_id, job.job_id);

            runner.add(job);
        }

        // remove jobs of reports that have been deleted
        for old_report_id in active_report_def_ids.difference(&report_def_ids) {
            info!(
                report_id = old_report_id,
                "report no longer exists. removing scheduled job"
            );

            if let Some(job_id) = active_job_map.remove(old_report_id) {
                runner.remove(job_id);
            }
        }

        runner.tick();
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
