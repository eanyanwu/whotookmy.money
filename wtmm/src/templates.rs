use askama::Template;

#[derive(Template)]
#[template(path = "purchase_digest.txt")]
pub struct PurchaseDigestTemplate {
    pub total_spend: String,
    pub count_transactions: usize,
    pub start: String,
    pub end: String,
    pub purchases: Vec<(String, String)>,
}
