use crate::email::get_domain;

pub struct OutboundEmail {
    sender: String,
    destination: String,
    subject: Option<String>,
    body: Option<String>,
}

impl OutboundEmail {
    pub fn new(to: &str, subject: Option<&str>, body: Option<&str>) -> Self {
        let mut sender = String::from("alerts");
        sender.push_str(get_domain());

        Self {
            sender,
            destination: to.to_string(),
            subject: subject.map(|s| s.to_string()),
            body: body.map(|s| s.to_string()),
        }
    }

    /// Get the intended recipient of this email
    pub fn get_to(&self) -> &str {
        self.destination.as_str()
    }

    /// Get the email address that will be used to send this email
    pub fn get_from(&self) -> &str {
        self.sender.as_str()
    }

    /// Get the subject of this email
    pub fn get_subject(&self) -> &str {
        self.subject.as_deref().unwrap_or_default()
    }

    /// Get the body of this email
    pub fn get_body(&self) -> &str {
        self.body.as_deref().unwrap_or_default()
    }
}

#[cfg(test)]
mod test {}
