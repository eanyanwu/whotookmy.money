use crate::currency::cents_to_dollar_string;
use crate::purchase::Purchase;
use chrono::{TimeZone, Utc};
use cron::Schedule;
use rusqlite::Row;
use rusqlite::{types::FromSql, types::FromSqlError, types::FromSqlResult, types::ValueRef};
use std::fmt;
use std::fmt::{Display, Formatter};
use std::str::FromStr;
use thiserror::Error;
use askama::Template;

#[derive(Template)]
#[template(path = "purchase_digest.txt")]
struct PurchaseDigestTemplate {
    total_spend: String,
    count_transactions: usize,
    start: String,
    end: String,
    purchases: Vec<(String, String)>
}

#[derive(Debug)]
pub struct PurchaseDigest {
    purchase_by_cost: Vec<Purchase>,
    start: i64,
    end: i64,
}

impl PurchaseDigest {
    /// Create a new purchase digest report
    ///
    /// We assume that the purchases are sorted by cost
    pub fn new(purchases: Vec<Purchase>, start: i64, end: i64) -> Self {
        Self {
            purchase_by_cost: purchases,
            start,
            end,
        }
    }

    /// Returns the list of purchases
    pub fn get_purchases(&self) -> &[Purchase] {
        self.purchase_by_cost.as_slice()
    }

    /// Returns the timestamp of the start of this report's period
    pub fn get_period_start(&self) -> i64 {
        self.start
    }

    /// Returns the timestamp of the end of this report's period
    pub fn get_period_end(&self) -> i64 {
        self.end
    }

    // TODO: Offer an html version of this
    pub fn render_html(&self) -> Option<String> {
        None
    }

    /// Get the report's body, as would be seen in an email
    pub fn render_text(&self) -> Option<String> {
        let total_spend = cents_to_dollar_string(
            self.purchase_by_cost
                .iter()
                .map(|p| p.get_amount_in_cents())
                .sum(),
        );
        let count_transactions = self.purchase_by_cost.len();
        let mut purchases: Vec<(String, String)> = Vec::new();
        let start = Report::format_date(Utc.timestamp(self.start, 0));
        let end = Report::format_date(Utc.timestamp(self.end, 0));

        for purchase in self.purchase_by_cost.iter().take(3) {
            purchases.push((
                    purchase.get_merchant().to_string(),
                    cents_to_dollar_string(purchase.get_amount_in_cents())
            ));
        }

        let template = PurchaseDigestTemplate {
            start,
            end,
            total_spend,
            purchases,
            count_transactions,
        };

        template.render().ok()
    }
}

/// A user report
#[derive(Debug)]
pub enum Report {
    PurchaseDigest(PurchaseDigest),
}

impl Report {
    /// Get the report's subject line as would be seen in an email
    pub fn get_subject(&self) -> String {
        match self {
            Report::PurchaseDigest(_) => String::from("Your Purchase Digest Report is here"),
        }
    }

    fn format_date<T: chrono::Datelike>(d: T) -> String {
        let months = [
            "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
        ];
        format!(
            "{weekday}, {day:02} {month} {year}",
            weekday = d.weekday(),
            month = months[d.month0() as usize],
            day = d.day(),
            year = d.year(),
        )
    }

    pub fn get_text_body(&self) -> Option<String> {
        match self {
            Report::PurchaseDigest(d) => d.render_text()
        }
    }

    pub fn get_html_body(&self) -> Option<String> {
        match self {
            Report::PurchaseDigest(d) => d.render_html()
        }
    }

}

/// Enum representing the different flavors of reports we support
#[derive(Debug, Eq, PartialEq, Clone, Copy)]
pub enum ReportType {
    PurchaseDigest,
}

impl Display for ReportType {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        match self {
            ReportType::PurchaseDigest => write!(f, "PURCHASE_DIGEST"),
        }
    }
}

/// An error converting a string to `ReportType`  
#[derive(Debug, Error)]
#[error("failed to convert {0}")]
pub struct TryFromReportTypeError(String);

impl TryFrom<String> for ReportType {
    type Error = TryFromReportTypeError;

    fn try_from(i: String) -> Result<Self, Self::Error> {
        let i = i.to_uppercase();

        match i.as_str() {
            "PURCHASE_DIGEST" => Ok(ReportType::PurchaseDigest),
            _ => Err(TryFromReportTypeError(i)),
        }
    }
}

impl FromSql for ReportType {
    fn column_result(v: ValueRef<'_>) -> FromSqlResult<Self> {
        v.as_str().and_then(|a| {
            ReportType::try_from(a.to_string()).map_err(|e| FromSqlError::Other(Box::new(e)))
        })
    }
}

// Newtype wrapper around a cron::Schedule to allow for implementing the
// FromSql trait.
#[derive(Clone)]
pub struct JobSchedule(pub Schedule);

impl FromSql for JobSchedule {
    fn column_result(v: ValueRef<'_>) -> FromSqlResult<Self> {
        v.as_str().and_then(|a| {
            Ok(JobSchedule(
                Schedule::from_str(a).map_err(|e| FromSqlError::Other(Box::new(e)))?,
            ))
        })
    }
}

/// Defines the type and frequency of a report
#[derive(Clone)]
pub struct ReportDefinition {
    user_email: String,
    report_type: ReportType,
    schedule: JobSchedule,
    created_at: i64,
}

impl TryFrom<&Row<'_>> for ReportDefinition {
    type Error = rusqlite::Error;

    fn try_from(input: &Row) -> Result<Self, Self::Error> {
        let user_email = input.get::<_, String>(0)?;
        let report_type = input.get::<_, ReportType>(1)?;
        let schedule = input.get::<_, JobSchedule>(2)?;
        let created_at = input.get::<_, i64>(3)?;

        Ok(Self {
            user_email,
            report_type,
            schedule,
            created_at,
        })
    }
}

impl ReportDefinition {
    /// Create a new report definition
    pub fn new(email: &str, report_type: ReportType, schedule: cron::Schedule) -> Self {
        Self {
            user_email: email.into(),
            report_type,
            schedule: JobSchedule(schedule),
            created_at: Utc::now().timestamp(),
        }
    }

    /// Get the report owner's email address
    pub fn get_user_email(&self) -> &str {
        self.user_email.as_str()
    }

    /// Get the report type
    pub fn get_report_type(&self) -> ReportType {
        self.report_type
    }

    /// Get the report's schedule
    pub fn get_schedule(&self) -> &Schedule {
        &self.schedule.0
    }

    /// Get the timestamp at which this report definition was created
    pub fn get_created_at(&self) -> i64 {
        self.created_at
    }
}

#[cfg(test)]
mod test {
    use super::{PurchaseDigest, Report};
    use crate::purchase::Purchase;
    use chrono::{Duration as CDuration, Utc};

    #[test]
    fn test_date_formatting() {
        let ten_days_ago = Utc::now().checked_sub_signed(CDuration::days(10)).unwrap();

        let formatted = Report::format_date(ten_days_ago);

        println!("{} {}", formatted, ten_days_ago.to_rfc2822());

        assert!(ten_days_ago.to_rfc2822().contains(&formatted));
    }

    #[test]
    fn test_report_generation() {
        let purchases = vec![
            Purchase::new("email", 100, "APPLE", 1),
            Purchase::new("email", 300, "KENMORE", 2),
            Purchase::new("email", 400, "DELL", 3),
            Purchase::new("email", 500, "USB", 4),
        ];

        let report = Report::PurchaseDigest(PurchaseDigest::new(purchases, 1, 4));

        let body = report.get_text_body().unwrap();

        println!("{body}");

        assert!(body.contains("$13.00"));
        // Only the first three transactions are displayed
        assert!(!body.contains("USB"));

        // For now
        assert_eq!(report.get_html_body(), None);
    }

    #[test]
    fn test_report_generation_no_transactions() {
        let purchases: Vec<Purchase> = Vec::new();

        let report = Report::PurchaseDigest(PurchaseDigest::new(purchases, 1, 4));

        let body = report.get_text_body().unwrap();

        println!("{body}");
        assert!(body.contains("No transactions from"));
    }
}
