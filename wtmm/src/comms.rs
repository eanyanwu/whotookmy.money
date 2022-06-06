use crate::currency::cents_to_dollar_string;

pub fn welcome_email(bank_alert_email: &str) -> (String, String) {
    (
        String::from("Welcome!"),
        format!(
            concat!(
                "You are receiving this email because you signed up for the whotookmy.money service\n",
                "You'll receive an email every week detailing where you money has gone.\n",
                "Here is your bank alert email address: {}\n",
                "Use that to register for online banking alerts\n"
            ),
            bank_alert_email
        )
    )
}

pub fn purchase_digest(
    total_spent: u64,
    top_purchases: Vec<&(u64, String)>,
    top_merchants: Vec<&(u64, String)>,
) -> (String, String) {
    let mut top_purchases_str = String::new();
    let mut top_merchants_str = String::new();

    for purchase in top_purchases {
        top_purchases_str.push_str(&format!(
            "{}: {}\n",
            purchase.1,
            cents_to_dollar_string(purchase.0)
        ));
    }

    for merchant in top_merchants {
        top_merchants_str.push_str(&format!(
            "{}: {}\n",
            merchant.1,
            cents_to_dollar_string(merchant.0)
        ));
    }
    (
        String::from("Your Weekly Purchase Digest"),
        format!(
            concat!(
                "Total Spent this period: {}\n",
                "Your Top Purchases:\n",
                "{}",
                "Your Favorite Merchants:\n",
                "{}",
            ),
            cents_to_dollar_string(total_spent),
            top_purchases_str,
            top_merchants_str,
        ),
    )
}
