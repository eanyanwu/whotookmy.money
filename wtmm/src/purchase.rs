use crate::currency;
use crate::email::Email;
use rusqlite::Row;
use thiserror::Error;

const SCHWAB_ALERT_EMAIL: &str = "donotreply-comm@schwab.com";
const CHASE_ALERT_EMAIL: &str = "no.reply.alerts@chase.com";

/// Errors that can occur while extracting purchase information from an email.
#[derive(Error, Debug)]
pub enum PurchaseError {
    #[error("failed to extract transaction from email")]
    ParsingError(&'static str),
    #[error("unknown sender")]
    UnknownSender,
    #[error("invalid purchase amount")]
    InvalidPurchaseAmount,
}

/// A user purchase, extracted from an email alert
#[derive(Debug)]
pub struct Purchase {
    user_email: String,
    amount_in_cents: u64,
    merchant: String,
    timestamp: i64,
}

impl Purchase {
    /// Create a new Purchase
    pub fn new(email: &str, amount_in_cents: u64, merchant: &str, timestamp: i64) -> Self {
        Self {
            user_email: email.to_string(),
            amount_in_cents,
            merchant: merchant.to_string(),
            timestamp,
        }
    }

    /// Returns the user to which this purchase belongs
    pub fn get_user_email(&self) -> &str {
        self.user_email.as_str()
    }

    /// Returns the purchase amount in cents
    pub fn get_amount_in_cents(&self) -> u64 {
        self.amount_in_cents
    }

    /// Returns the name of the merchant for this purchase
    pub fn get_merchant(&self) -> &str {
        self.merchant.as_str()
    }

    /// Returns the unix timestamp at which this purchase occured
    pub fn get_timestamp(&self) -> i64 {
        self.timestamp
    }
}

impl TryFrom<&Row<'_>> for Purchase {
    type Error = rusqlite::Error;

    /// Try to convert a database row in a purchase
    /// Assumes that the columns are in the same order as the struct
    fn try_from(r: &Row) -> Result<Self, Self::Error> {
        Ok(Self {
            user_email: r.get::<_, String>(0)?,
            amount_in_cents: r.get::<_, u64>(1)?,
            merchant: r.get::<_, String>(2)?,
            timestamp: r.get::<_, i64>(3)?,
        })
    }
}

impl TryFrom<&Email> for Purchase {
    type Error = PurchaseError;

    /// Try to convert an `Email` into a purchase
    ///
    /// # Fails
    ///
    /// Fails when the email is not in in the format we expect
    fn try_from(input: &Email) -> Result<Self, Self::Error> {
        let from = input.get_from();
        let to = input.get_to();

        let body = input
            .get_body()
            .ok_or_else(|| PurchaseError::ParsingError("Missing body"))?;

        let lines = body
            .split('\n')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect::<Vec<&str>>();

        let amount;
        let merchant;

        if from == CHASE_ALERT_EMAIL {
            merchant = lines
                .iter()
                .position(|&x| x == "Merchant")
                .and_then(|i| lines.get(i + 1))
                .ok_or_else(|| PurchaseError::ParsingError("Merchant"))?;
            amount = lines
                .iter()
                .position(|&x| x == "Amount")
                .and_then(|i| lines.get(i + 1))
                .ok_or_else(|| PurchaseError::InvalidPurchaseAmount)?;
        } else if from == SCHWAB_ALERT_EMAIL {
            merchant = lines
                .iter()
                .position(|&x| x == "Amount")
                .and_then(|i| lines.get(i + 1))
                .ok_or_else(|| PurchaseError::ParsingError("Merchant"))?;
            // This isn't a mistake. The amount is two positions past the word
            // 'Merchant'
            amount = lines
                .iter()
                .position(|&x| x == "Amount")
                .and_then(|i| lines.get(i + 2))
                .ok_or_else(|| PurchaseError::InvalidPurchaseAmount)?;
        } else {
            return Err(PurchaseError::UnknownSender);
        }

        let amount = currency::dollar_string_to_cents(amount)
            .map_err(|_| PurchaseError::InvalidPurchaseAmount)?;

        Ok(Self {
            user_email: to.to_string(),
            amount_in_cents: amount,
            merchant: merchant.to_string(),
            timestamp: input
                .get_timestamp()
                .map_err(|_| PurchaseError::ParsingError("Date"))?,
        })
    }
}

#[cfg(test)]
mod test {
    use super::{Purchase, PurchaseError, CHASE_ALERT_EMAIL, SCHWAB_ALERT_EMAIL};
    use crate::email::Email;
    use std::fs;

    #[test]
    fn test_email_from_unknown_sender() {
        let email = Email::new(
            "a@example.com",
            "b@example.com",
            "Wed, 8 Jun 2022 12:23:38 -0400 (EDT)",
            "",
        )
        .unwrap();

        let purchase = Purchase::try_from(&email);

        assert!(matches!(purchase, Err(PurchaseError::UnknownSender)));
    }

    #[test]
    fn test_invalid_purchase_amount() {
        let email = Email::new(
            "a@example.com",
            SCHWAB_ALERT_EMAIL,
            "Wed, 8 Jun 2022 12:23:38 -0400 (EDT)",
            &format!("Merchant\nAmount\nAIRBNB\n1200"),
        )
        .unwrap();

        let purchase = Purchase::try_from(&email);

        assert!(matches!(
            purchase,
            Err(PurchaseError::InvalidPurchaseAmount)
        ));
    }

    #[test]
    fn test_parse_schwab_like_email() {
        let email = Email::new(
            "a@example.com",
            SCHWAB_ALERT_EMAIL,
            "Wed, 8 Jun 2022 12:23:38 -0400 (EDT)",
            &format!("Merchant\nAmount\nAIRBNB\n$120.00"),
        )
        .unwrap();

        let purchase = Purchase::try_from(&email).unwrap();

        assert_eq!(purchase.get_amount_in_cents(), 12000);
        assert_eq!(purchase.get_merchant(), "AIRBNB");
        assert_eq!(purchase.get_timestamp(), 1654705418);
    }

    #[test]
    fn test_parse_chase_like_email() {
        let email = Email::new(
            "a@example.com",
            CHASE_ALERT_EMAIL,
            "Wed, 8 Jun 2022 12:23:38 -0400 (EDT)",
            &format!("Merchant\nAIRBNB\nAmount\n$120.00"),
        )
        .unwrap();

        let purchase = Purchase::try_from(&email).unwrap();

        assert_eq!(purchase.get_amount_in_cents(), 12000);
        assert_eq!(purchase.get_merchant(), "AIRBNB");
        assert_eq!(purchase.get_timestamp(), 1654705418);
    }

    #[test]
    fn test_parse_real_chase_email() {
        let mime = fs::read_to_string("./test_assets/chase_alert").unwrap();
        let email = Email::try_from(mime.as_str()).unwrap();
        let purchase = Purchase::try_from(&email).unwrap();

        assert_eq!(purchase.get_amount_in_cents(), 6383);
        assert_eq!(purchase.get_merchant(), "ANMOL INDIAN RESTAUR");
        assert_eq!(purchase.get_timestamp(), 1654461896);
    }

    #[test]
    fn test_parse_real_schwab_email() {
        let mime = fs::read_to_string("./test_assets/schwab_alert").unwrap();
        let email = Email::try_from(mime.as_str()).unwrap();
        let purchase = Purchase::try_from(&email).unwrap();

        assert_eq!(purchase.get_amount_in_cents(), 999);
        assert_eq!(purchase.get_merchant(), "Spotify USA");
        assert_eq!(purchase.get_timestamp(), 1654456174);
    }
}
