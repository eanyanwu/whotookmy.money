//! Handling of the Forwarding confirmation email that gmail sends

use crate::email::Email;
use thiserror::Error;

#[derive(Debug, Error)]
#[error("could not parse gmail forwarding confirmation")]
pub struct TryFromEmailError {}

/// The result of parsing a gmail forwarding confirmation email
pub struct GmailForwardingConfirmation {
    confirmation_url: String,
    confirmation_code: String,
    user_email: String,
}

impl TryFrom<&Email> for GmailForwardingConfirmation {
    type Error = TryFromEmailError;

    fn try_from(parsed: &Email) -> Result<Self, Self::Error> {
        let lines = parsed
            .get_body()
            .unwrap_or_default()
            .split('\n')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect::<Vec<&str>>();

        let confirmation_code_line = lines
            .iter()
            .find(|s| s.starts_with("Confirmation code:"))
            .ok_or_else(|| TryFromEmailError {})?;

        let confirmation_code = confirmation_code_line
            .split(' ')
            .last()
            .ok_or_else(|| TryFromEmailError {})?;

        let confirmation_url = lines
            .iter()
            .find(|s| s.starts_with("https://mail-settings.google.com/"))
            .ok_or_else(|| TryFromEmailError {})?;

        // The user's email is the very first thing on the first line.
        // If we have reached this poit, it's safe to assume that there is at least one line
        let user_email = lines[0]
            .split(' ')
            .next()
            .ok_or_else(|| TryFromEmailError {})?;

        Ok(Self {
            confirmation_code: confirmation_code.to_string(),
            confirmation_url: confirmation_url.to_string(),
            user_email: user_email.to_string(),
        })
    }
}

impl GmailForwardingConfirmation {
    /// Returns the gmail forwarding confirmation url
    pub fn get_confirmation_url(&self) -> &str {
        self.confirmation_url.as_str()
    }

    /// Returns the gmail forwarding confirmation code
    pub fn get_confirmation_code(&self) -> &str {
        self.confirmation_code.as_str()
    }

    /// Returns the email of the user that is forwarding to us
    pub fn get_user_email(&self) -> &str {
        self.user_email.as_str()
    }
}

#[cfg(test)]
mod test {
    use super::GmailForwardingConfirmation;
    use crate::email::Email;
    use std::fs;

    #[test]
    fn test_parse_gmail_confirmation_email() {
        let email = fs::read_to_string("./test_assets/gmail_confirmation_email").unwrap();
        let email = Email::try_from(email.as_str()).unwrap();
        let confirmation = GmailForwardingConfirmation::try_from(&email).unwrap();

        assert_eq!(
            confirmation.get_confirmation_url(),
            "https://mail-settings.google.com/mail/vf-%5BANGjdJ9_brCNgl_AIYnkFYn9TgEgE1Q3aXdCDrnvN_EWcfT-DVEgYCEhn7KrQa90K4VIfQupv52uc5K8NMe4T2B06UAI3u49LOhRBXchEA%5D-e3P7aWGI7DzF8ZKCxNnqxqn0blw"
            );
        assert_eq!(confirmation.get_confirmation_code(), "83581330");
        assert_eq!(
            confirmation.get_user_email(),
            "ezeanyinabia.anyanwu@gmail.com"
        );
    }
}
