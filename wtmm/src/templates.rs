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

#[derive(Template)]
#[template(path = "income_form_email.txt")]
pub struct IncomeFormEmailTextTemplate {
    pub link: String,
}

#[derive(Template)]
#[template(path = "income_form_email.html")]
pub struct IncomeFormEmailHtmlTemplate {
    pub link: String,
}
