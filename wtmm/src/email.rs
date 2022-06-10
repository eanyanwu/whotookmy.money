use chrono::DateTime;
use mailparse::{addrparse_header, MailAddr, MailHeader, MailHeaderMap};
use serde::Deserialize;
use std::env;
use std::sync::Once;
use thiserror::Error;

static mut DOMAIN: Option<String> = None;

static INIT: Once = Once::new();

/// Returns the domain name to send emails from.
pub fn get_domain() -> &'static String {
    // Unsafe: Accessing a static mut is unsufe most of the time.
    // However, here the static mut is a `Once`, which guarantees that
    // the one write we do happens in a synchronized fashion.
    unsafe {
        // The first time this is called, we lookup the environmetn variable and save it.
        // Subsequent calls use the saved value
        INIT.call_once(|| {
            let domain = env::var("EMAIL_DOMAIN").unwrap_or(String::from("@dev.whotookmy.money"));
            DOMAIN = Some(domain);
        });

        DOMAIN.as_ref().unwrap()
    }
}

pub fn get_bank_alert_email() -> String {
    let mut email = String::from("alerts");
    email.push_str(&get_domain());
    email
}

/// An inbound email from Postmark.
/// Althought the payload has many more fields than are present here, we only need about the raw
/// email field
#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct PostmarkInboundEmail {
    pub raw_email: String,
}

/// An error returned from parsing a raw email string as `Email`
#[derive(Debug, Error)]
pub enum EmailError {
    #[error("error parsing email")]
    ParsingError(#[from] Option<mailparse::MailParseError>),
    #[error("invalid date")]
    InvalidRfc2822Date,
}

/// Internal email representation
pub struct Email {
    to: String,
    from: String,
    rfc2822_date: String,
    html_body_stripped: Option<String>,
    text_body: Option<String>,
    message_id: Option<String>,
}

impl Email {
    fn validate_and_normalize_rfc2822_date(d: &str) -> Option<String> {
        // Some emails might contain a trailing timezone indicator in parens (e.g. EST)
        // This doesn't conform to the standard at worst, and is obsolete at best.
        // Chop of that part and valide the rest
        let mut d = d;
        if let Some(idx) = d.find('(') {
            d = &d[..idx - 1];
        }

        if let Ok(_) = DateTime::parse_from_rfc2822(d) {
            Some(String::from(d))
        } else {
            None
        }
    }

    /// Creates an Email object. `body` is assumed to be plain text
    pub fn new(to: &str, from: &str, rfc2822_date: &str, body: &str) -> Result<Self, EmailError> {
        // Emails might additionally contains the obsolete timezone within parens. Disregard it
        let rfc2822_date = Email::validate_and_normalize_rfc2822_date(rfc2822_date)
            .ok_or_else(|| EmailError::InvalidRfc2822Date)?;
        // Validate the date
        Ok(Self {
            to: to.to_string(),
            from: from.to_string(),
            rfc2822_date: rfc2822_date.to_string(),
            html_body_stripped: None,
            text_body: Some(body.to_string()),
            message_id: None,
        })
    }

    /// Returns the content html content of the email, stripped of tags.
    /// If the email did not have a text/html subpart, the text/plain supbart is returned instead.
    /// This assumes that the supbarts have the same content, but with different representations
    pub fn get_body(&self) -> Option<&str> {
        self.html_body_stripped
            .as_deref()
            .or(self.text_body.as_deref())
    }

    /// Returns the address the email was sent to
    /// If the email was sent to multiple people, we pick the last one
    pub fn get_to(&self) -> &str {
        self.to.as_str()
    }

    /// Returns the email sender's address
    pub fn get_from(&self) -> &str {
        self.from.as_str()
    }

    /// Attempts to parse and convert the rfc2822_date to a unix timestamp
    pub fn get_timestamp(&self) -> Result<i64, EmailError> {
        mailparse::dateparse(&self.rfc2822_date).map_err(|e| {
            tracing::error!("could not parse Date: from header");
            EmailError::ParsingError(Some(e))
        })
    }

    /// Returns the date as was preent in the email's date header
    pub fn get_rfc2822_date(&self) -> &str {
        &self.rfc2822_date
    }

    /// Get this email's timezone offset from UTC
    pub fn get_tz_offset(&self) -> i32 {
        // Safe to do as we validated the string on creation
        let date = DateTime::parse_from_rfc2822(&self.rfc2822_date).unwrap();

        date.offset().local_minus_utc()
    }

    /// Gets this email's message ID if it was specified
    pub fn get_message_id(&self) -> Option<&str> {
        self.message_id.as_deref()
    }

    // Extract an address list from `mailparse::MailHeader`
    // Returns an error if the header passed in is not a valid address or list of addresses
    fn extract_addresses(header: &MailHeader) -> Result<Vec<String>, mailparse::MailParseError> {
        let addr_list = addrparse_header(header);
        addr_list.map(|l| {
            l.into_inner()
                .into_iter()
                .flat_map(|a| match a {
                    MailAddr::Group(group) => group
                        .addrs
                        .into_iter()
                        .map(|a| a.addr)
                        .collect::<Vec<String>>(),
                    MailAddr::Single(single) => {
                        vec![single.addr]
                    }
                })
                .collect::<Vec<String>>()
        })
    }

    // Check if the Content-Type header contains `pattern`
    fn is_type(mail: &mailparse::ParsedMail, pattern: &str) -> bool {
        if let Some(c) = mail.headers.get_first_value("Content-Type") {
            c.contains(pattern)
        } else {
            false
        }
    }

    // Strip html tags from a string naively by ignoring any characters between angle brackets.
    fn strip_tags<T: AsRef<str>>(input: T) -> String {
        let bytes = input.as_ref().as_bytes();
        let len = bytes.len();
        let mut output = String::with_capacity(len);

        let mut in_tag = false;
        let mut saw_content = false;
        for b in bytes {
            match b {
                b'<' => {
                    // We are in a tag. Ignore any content
                    in_tag = true;
                    // If we had seen some content in the previous iteration, append a newline
                    if saw_content {
                        output.push('\n');
                        saw_content = false
                    }
                }
                b'>' if in_tag => {
                    // If we are in a tag, and see `>`, are no longer in a tag. Subsequent characters
                    // could be content!
                    in_tag = false;
                }
                _ if !in_tag => {
                    // If we are not in a tag, and the current character is not an angle bracket
                    // we treat it as content
                    output.push((*b).into());
                    saw_content = true;
                }
                // Everything else is ignored
                _ => {}
            }
        }

        output
    }

    // Searches the input for opening and closing body tags and returns everything in between
    fn extract_html_body(input: &str) -> Option<&str> {
        if let Some(start) = input.find("<body") {
            if let Some(end) = input.find("</body>") {
                return Some(&input[start..=end + 6]);
            }
        }
        None
    }
}

/// Convert MIME email content to our internal data structure.
///
/// # Errors
///
/// The conversion will fail if we are unable to parse any of the required headers
/// of if a text/html subpart was not properly formatted
impl TryFrom<&str> for Email {
    type Error = EmailError;

    fn try_from(input: &str) -> Result<Self, Self::Error> {
        let parsed = mailparse::parse_mail(input.as_bytes())?;
        let headers = parsed.get_headers();

        let to_header = headers.get_first_header("To").ok_or_else(|| {
            tracing::error!("missing To: header");
            EmailError::ParsingError(None)
        })?;
        let from_header = headers.get_first_header("From").ok_or_else(|| {
            tracing::error!("missing From: header");
            EmailError::ParsingError(None)
        })?;
        let date_str = headers.get_first_value("Date").ok_or_else(|| {
            tracing::error!("missing Date: header");
            EmailError::ParsingError(None)
        })?;
        let rfc2822_date =
            Email::validate_and_normalize_rfc2822_date(&date_str).ok_or_else(|| {
                tracing::error!("invalid rfc2822 date header: {} ", date_str);
                EmailError::InvalidRfc2822Date
            })?;

        // optionally parse the Message-ID
        let msg_id = headers.get_first_value("Message-ID");

        let to = Email::extract_addresses(to_header)
            .map_err(|e| {
                tracing::error!("could not parse To: header");
                EmailError::ParsingError(Some(e))
            })?
            .pop()
            .ok_or_else(|| {
                tracing::error!("no To: address found");
                EmailError::ParsingError(None)
            })?
            .to_ascii_lowercase();
        let from = Email::extract_addresses(from_header)
            .map_err(|e| {
                tracing::error!("could not parse From: header");
                EmailError::ParsingError(Some(e))
            })?
            .pop()
            .ok_or_else(|| {
                tracing::error!("no From: address found");
                EmailError::ParsingError(None)
            })?
            .to_ascii_lowercase();

        let mut html_body_stripped = None;
        let mut text_body = None;

        let html_part = subpart_iter(&parsed).find(|&p| Email::is_type(p, "text/html"));
        if let Some(html) = html_part {
            let html_body = html.get_body().map_err(|e| {
                tracing::error!("could not parse text/html body");
                EmailError::ParsingError(Some(e))
            })?;

            let html_body = Email::extract_html_body(&html_body).ok_or_else(|| {
                tracing::error!("text/html body was badly formatted");
                EmailError::ParsingError(None)
            })?;

            html_body_stripped = Some(Email::strip_tags(html_body));
        }

        let text_part = subpart_iter(&parsed).find(|&p| Email::is_type(p, "text/plain"));
        if let Some(text) = text_part {
            let text = text.get_body().map_err(|e| {
                tracing::error!("could not parse text/plain body");
                EmailError::ParsingError(Some(e))
            })?;

            text_body = Some(text);
        }

        Ok(Self {
            to,
            from,
            rfc2822_date,
            text_body,
            html_body_stripped,
            message_id: msg_id,
        })
    }
}

pub struct ParsedMailSubpartIter<'a> {
    idx: usize,
    mail: &'a mailparse::ParsedMail<'a>,
}

impl<'a> Iterator for ParsedMailSubpartIter<'a> {
    type Item = &'a mailparse::ParsedMail<'a>;

    fn next(&mut self) -> Option<Self::Item> {
        let res;
        if self.idx == 0 {
            res = Some(self.mail);
        } else {
            let idx = self.idx - 1;
            res = self.mail.subparts.get(idx);
        }

        self.idx += 1;
        res
    }
}

pub fn subpart_iter<'a>(mail: &'a mailparse::ParsedMail) -> ParsedMailSubpartIter<'a> {
    ParsedMailSubpartIter { idx: 0, mail }
}

#[cfg(test)]
mod test {
    use super::Email;

    #[test]
    fn test_extract_body() {
        assert_eq!(
            Email::extract_html_body("<html><head></head><body>TEST</body></html>"),
            Some("<body>TEST</body>")
        );

        // test html body with attributes
        assert_eq!(
            Email::extract_html_body("<html><head></head><body class=\"hello\">TEST</body></html>"),
            Some("<body class=\"hello\">TEST</body>")
        );

        assert_eq!(Email::extract_html_body("hello"), None);
    }

    #[test]
    fn test_strip_tags() {
        // simple
        assert_eq!(
            Email::strip_tags("<html><head><link /></head>TEST</html>"),
            "TEST\n"
        );

        // test trailing newlines
        assert_eq!(
            Email::strip_tags(
                "<html><head></head><body><div>SOME TEXT</div><div>OTHER TEXT</div></body></html>"
            ),
            "SOME TEXT\nOTHER TEXT\n"
        );

        // test angle brackets within content
        assert_eq!(
            Email::strip_tags("<html><script>if true > false { test }</script></html>"),
            "if true > false { test }\n",
        );
    }

    #[test]
    fn test_try_convert_string_to_email() {
        let mime = concat!(
            "MIME-Version: 1.0\n",
            "Date: Tue, 31 May 2022 15:23:12 -0400\n",
            "From: Some One<someone@example.org>\n",
            "To: Person One<person1@example.org>\n",
            "Content-Type: multipart/mixed; boundary=frontier\n\n",
            "MSG1\n",
            "--frontier\n",
            "Content-Type: text/plain\n\n",
            "MSG2\n",
            "--frontier\n",
            "Content-Type: text/html\n\n",
            "<html><head><link /></head><body>MSG3</body></html>\n",
            "--frontier--"
        );

        let email = Email::try_from(mime).unwrap();

        assert_eq!(email.get_to(), "person1@example.org");
        assert_eq!(email.get_from(), "someone@example.org");
        assert_eq!(email.get_timestamp().unwrap(), 1654024992);
        assert_eq!(email.get_body(), Some("MSG3\n"));
    }

    #[test]
    fn test_try_convert_email_no_html_subpart() {
        let mime = concat!(
            "MIME-Version: 1.0\n",
            "Date: Tue, 31 May 2022 15:23:12 -0400\n",
            "From: Some One<someone@example.org>\n",
            "To: Person One<person1@example.org>\n",
            "Content-Type: multipart/mixed; boundary=frontier\n\n",
            "MSG1\n",
            "--frontier\n",
            "Content-Type: text/plain\n\n",
            "MSG2\n",
            "--frontier--"
        );

        let email = Email::try_from(mime).unwrap();
        assert_eq!(email.get_to(), "person1@example.org");
        assert_eq!(email.get_from(), "someone@example.org");
        assert_eq!(email.get_timestamp().unwrap(), 1654024992);
        assert_eq!(email.get_body(), Some("MSG2\n"));
    }

    #[test]
    fn test_try_convert_no_html_or_plain_subpart() {
        let mime = concat!(
            "MIME-Version: 1.0\n",
            "Date: Tue, 31 May 2022 15:23:12 -0400\n",
            "From: Some One<someone@example.org>\n",
            "To: Person One<person1@example.org>\n",
            "Content-Type: multipart/mixed; boundary=frontier\n\n",
            "MSG1\n",
            "--frontier--"
        );

        let email = Email::try_from(mime).unwrap();
        assert_eq!(email.get_to(), "person1@example.org");
        assert_eq!(email.get_from(), "someone@example.org");
        assert_eq!(email.get_timestamp().unwrap(), 1654024992);
        assert_eq!(email.get_body(), None);
    }

    #[test]
    fn test_try_convert_address_is_lowercased() {
        let mime = concat!(
            "MIME-Version: 1.0\n",
            "Date: Tue, 31 May 2022 15:23:12 -0400\n",
            "From: Some One<SOMEONE@example.org>\n",
            "To: Person One<PERSON1@example.org>\n",
            "Content-Type: text/plain\n\n",
            "MSG1\n",
        );

        let email = Email::try_from(mime).unwrap();
        assert_eq!(email.get_to(), "person1@example.org");
        assert_eq!(email.get_from(), "someone@example.org");
    }

    #[test]
    fn test_try_convert_slightly_obsolete_date_is_normalized() {
        let mime = concat!(
            "MIME-Version: 1.0\n",
            "Date: Tue, 31 May 2022 15:23:12 -0400 (EST)\n",
            "From: Some One<someone@example.org>\n",
            "To: Person One<person1@example.org>\n",
            "Content-Type: text/plain\n\n",
            "MSG1\n",
        );

        let email = Email::try_from(mime).unwrap();
        assert_eq!(email.get_rfc2822_date(), "Tue, 31 May 2022 15:23:12 -0400")
    }

    #[test]
    fn test_try_convert_invalid_date_causes_error() {
        let mime = concat!(
            "MIME-Version: 1.0\n",
            "Date: Tue, 31 May 2022 15:23:12\n",
            "From: Some One<someone@example.org>\n",
            "To: Person One<person1@example.org>\n",
            "Content-Type: text/plain\n\n",
            "MSG1\n",
        );

        let email = Email::try_from(mime);

        assert!(email.is_err())
    }
}
