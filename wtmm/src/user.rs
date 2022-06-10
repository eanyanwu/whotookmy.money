pub struct User {
    user_email: String,
    tz_offset: i32,
}

impl User {
    /// Creates a new user
    pub fn new(email: &str, tz_offset: i32) -> Self {
        Self {
            user_email: email.to_string(),
            tz_offset,
        }
    }

    /// Returns the user's email
    pub fn get_email(&self) -> &str {
        self.user_email.as_str()
    }

    /// Returns the user's timezone offset from UTC
    pub fn get_tz_offset(&self) -> i32 {
        self.tz_offset
    }
}
