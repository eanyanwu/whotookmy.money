use chrono::{DateTime, Utc};
use cron::Schedule;
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
#[error("scheduled job failed")]
pub struct ScheduledJobError(#[from] pub Box<dyn std::error::Error>);

pub struct ScheduledJob {
    pub job_id: Uuid,
    schedule: Schedule,
    run: Box<dyn Fn() -> Result<(), ScheduledJobError>>,
    last_tick: Option<DateTime<Utc>>,
}

impl ScheduledJob {
    pub fn new<F>(schedule: Schedule, run: F) -> Self
    where
        F: Fn() -> Result<(), ScheduledJobError>,
        F: 'static,
    {
        Self {
            job_id: Uuid::new_v4(),
            schedule,
            run: Box::new(run),
            last_tick: None,
        }
    }

    pub fn starting_from(&mut self, time: Option<DateTime<Utc>>) {
        self.last_tick = time;
    }

    // Every tick, run the job if at least one cron execution should have happened between
    // the last tick and now
    pub fn tick(&mut self) {
        let now = Utc::now();

        if self.last_tick.is_none() {
            self.last_tick = Some(now);
            return;
        }
        for event in self.schedule.after(&self.last_tick.unwrap()).take(1) {
            if event > now {
                break;
            }

            let res = (self.run)();

            if let Err(e) = res {
                let mut buffer = Uuid::encode_buffer();
                let id = self.job_id.simple().encode_lower(&mut buffer);
                tracing::error!(job_id = id, "error executing job: {}", e);
            }
        }

        self.last_tick = Some(now);
    }
}

pub struct JobRunner {
    jobs: Vec<ScheduledJob>,
}

impl JobRunner {
    pub fn new() -> Self {
        Self { jobs: Vec::new() }
    }

    pub fn add(&mut self, job: ScheduledJob) -> Uuid {
        let id = job.job_id;
        self.jobs.push(job);
        id
    }

    pub fn remove(&mut self, job_id: Uuid) {
        if let Some(idx) = self.jobs.iter().position(|j| j.job_id == job_id) {
            self.jobs.remove(idx);
        }
    }

    pub fn tick(&mut self) {
        for job in &mut self.jobs {
            job.tick();
        }
    }
}

#[cfg(test)]
mod test {
    use super::{JobRunner, ScheduledJob};
    use chrono::{Duration as ChronoDuration, TimeZone, Utc};
    use cron::Schedule;
    use std::str::FromStr;
    use std::sync::{Arc, Mutex};

    #[test]
    fn test_schedule() {
        // Asserting that the cron crate functions as expected
        // Added because I had some surprises as to the cron syntax it expects
        let every_monday = Schedule::from_str("0 0 12 ? * MON").unwrap();
        let every_five_min = Schedule::from_str("0 0/5 0 * * ?").unwrap();

        let start = Utc.ymd(2022, 5, 1).and_hms(0, 0, 0);

        let mut every_monday = every_monday.after(&start);
        let mut every_five_min = every_five_min.after(&start);

        assert_eq!(
            every_monday.next(),
            Some(Utc.ymd(2022, 5, 2).and_hms(12, 0, 0))
        );
        assert_eq!(
            every_monday.next(),
            Some(Utc.ymd(2022, 5, 9).and_hms(12, 0, 0))
        );

        assert_eq!(
            every_five_min.next(),
            Some(Utc.ymd(2022, 5, 1).and_hms(0, 5, 0))
        );
        assert_eq!(
            every_five_min.next(),
            Some(Utc.ymd(2022, 5, 1).and_hms(0, 10, 0))
        );
    }

    #[test]
    fn test_job_runner() {
        let s = Schedule::from_str("* * * * * * *").unwrap();
        let data = Arc::new(Mutex::new(0));

        let clone = data.clone();

        let mut job = ScheduledJob::new(s, move || {
            let mut data = clone.lock().unwrap();
            *data += 1;
            Ok(())
        });
        let job_id = job.job_id;
        // We expect to run once because there is more than one execution between now and ten seconds ago
        let ten_seconds_ago = Utc::now()
            .checked_sub_signed(ChronoDuration::seconds(10))
            .unwrap();
        job.starting_from(Some(ten_seconds_ago));

        let mut runner = JobRunner::new();
        runner.add(job);

        // THe job should run in this tick
        runner.tick();

        let t1 = *data.lock().unwrap();

        assert!(t1 > 0);

        // remove the job
        runner.remove(job_id);

        // Nothing should happen in this tick
        runner.tick();

        let t2 = *data.lock().unwrap();
        assert_eq!(t1, t2);
    }

    #[test]
    fn test_scheduled_job() {
        let s = Schedule::from_str("* * * * * * *").unwrap();
        let data = Arc::new(Mutex::new(0));

        let clone = data.clone();
        let mut job = ScheduledJob::new(s, move || {
            let mut data = clone.lock().unwrap();
            *data += 1;
            Ok(())
        });
        let ten_seconds_ago = Utc::now()
            .checked_sub_signed(ChronoDuration::seconds(10))
            .unwrap();
        job.starting_from(Some(ten_seconds_ago));

        job.tick();

        let t1 = *data.lock().unwrap();

        assert!(t1 > 0);

        // Although there should be executions ten seconds from now, we shouldn't run them yet
        let ten_seconds_from_now = Utc::now()
            .checked_add_signed(ChronoDuration::seconds(10))
            .unwrap();
        job.starting_from(Some(ten_seconds_from_now));

        job.tick();

        let t2 = *data.lock().unwrap();
        assert_eq!(t2, t1);
    }
}
