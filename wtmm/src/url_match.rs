use std::str::FromStr;

/// Result of a successful url match
pub struct UrlMatchResult<'a> {
    path_variables: Vec<&'a str>,
}

impl UrlMatchResult<'_> {
    pub fn get_path_variables(&self) -> &[&str] {
        self.path_variables.as_slice()
    }
}

/// A pattern to match requests against
pub struct UrlPattern<'a> {
    segments: Vec<&'a str>,
}

impl<'a> UrlPattern<'a> {
    pub fn new(url: &'a str) -> Self {
        Self {
            segments: UrlPattern::into_segments(url),
        }
    }

    fn get_segments(&self) -> &[&str] {
        self.segments.as_slice()
    }

    fn into_segments(url: &str) -> Vec<&str> {
        url.split('/')
            .map(|s| s.trim())
            .filter(|&s| s != "")
            .collect::<Vec<&str>>()
    }
}

/// Checks if `url` matches the `pattern`
/// If it does, the contained result is a list of the url path variables we
/// extracted, if any.
pub fn matches<'a>(url: &'a str, pattern: &UrlPattern) -> Option<UrlMatchResult<'a>> {
    let mut path_variables: Vec<&str> = Vec::new();

    // There is always a first element when we .split()
    let without_query_params = url.split('?').next().unwrap();

    // Convert both url and pattern into segments
    let pattern_segments = pattern.get_segments();
    let url_segments = UrlPattern::into_segments(without_query_params);

    // No match if the segment count between pattern and url differ
    if pattern_segments.len() != url_segments.len() {
        return None;
    }
    for i in 0..pattern.get_segments().len() {
        let pat = pattern_segments[i];
        let s = url_segments[i];

        if pat.starts_with(":") {
            // potential path variable
            let t = &pat[1..];
            // Can we convert the value at this segment `s` to the type the user wants?
            let can_convert = match t.to_ascii_lowercase().as_str() {
                "str" => true,
                "id" => {
                    if let Err(_) = i64::from_str(s) {
                        false
                    } else {
                        true
                    }
                }
                _ => false,
            };

            if !can_convert {
                return None;
            }

            path_variables.push(s);
        } else {
            // exact match
            if !pat.eq_ignore_ascii_case(s) {
                return None;
            }
        }
    }

    Some(UrlMatchResult { path_variables })
}

#[cfg(test)]
mod test {
    use super::{matches, UrlPattern};

    #[test]
    fn test_matches_root() {
        let url = matches("GET/", &UrlPattern::new("GET/")).unwrap();
        assert_eq!(url.path_variables.len(), 0);
    }

    #[test]
    fn test_matches_without_variables() {
        let url = matches("GET/user/resource", &UrlPattern::new("GET/user/resource")).unwrap();
        assert_eq!(url.path_variables.len(), 0);
    }

    #[test]
    fn test_matches_with_str_variable() {
        let url = matches(
            "GET/user/00fd/profile",
            &UrlPattern::new("GET/user/:str/profile"),
        )
        .unwrap();
        assert_eq!(url.path_variables, vec!["00fd"]);
    }

    #[test]
    fn test_matches_with_id_variable() {
        let url = matches(
            "GET/user/321/profile",
            &UrlPattern::new("GET/user/:id/profile"),
        )
        .unwrap();
        assert_eq!(url.path_variables, vec!["321"]);

        // Fails when the id can't be parsed as a i64
        let url = matches(
            "GET/user/hello/profile",
            &UrlPattern::new("GET/user/:id/profile"),
        );
        assert!(url.is_none());
    }

    #[test]
    fn test_matches_path_variable_order() {
        let url = matches("GET/1/2/3/4", &UrlPattern::new("GET/:id/:id/:id/:id")).unwrap();

        assert_eq!(url.path_variables, vec!["1", "2", "3", "4"])
    }

    #[test]
    fn test_match_ignore_query_params() {
        matches("GET/hello?query=params", &UrlPattern::new("GET/hello")).unwrap();
    }

    #[test]
    fn test_match_case_insensitive() {
        matches("GET/hello", &UrlPattern::new("get/hello")).unwrap();
    }

    #[test]
    fn test_no_match_different_verbs() {
        let url = matches("GET/user/hello", &UrlPattern::new("POST/user/hello"));
        assert!(url.is_none());
    }

    #[test]
    fn test_match_trailing_slashes() {
        matches("GET/user/hello/", &UrlPattern::new("GET/user/hello")).unwrap();

        matches("GET", &UrlPattern::new("GET/")).unwrap();
    }
}
