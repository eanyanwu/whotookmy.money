use std::error;
use std::fmt;
use std::str::FromStr;

#[derive(Debug)]
pub enum CurrencyError {
    InvalidAmountError(String),
}

impl error::Error for CurrencyError {}

impl fmt::Display for CurrencyError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CurrencyError::InvalidAmountError(amount) => {
                write!(f, "Problem parsing currency amount {}", amount)
            }
        }
    }
}

pub fn cents_to_dollar_string(input: u64) -> String {
    let mut dollar_str = input.to_string();
    let len = dollar_str.len();

    // If they only spen in the single cents, place a leading 0
    if len == 1 {
        dollar_str.insert(0, '0');
    }

    let len = dollar_str.len();

    // place the period
    dollar_str.insert(len - 2, '.');

    // if the string was exactly two digits, place a leading 0
    if len == 2 {
        dollar_str.insert(0, '0');
    }

    // place the dollar sign
    dollar_str.insert(0, '$');

    dollar_str
}

pub fn dollar_string_to_cents(input: &str) -> Result<u64, CurrencyError> {
    // We are looking for strings of the format $1234.54

    // Strip the leading $
    let amount_str = input
        .strip_prefix('$')
        .ok_or_else(|| CurrencyError::InvalidAmountError(input.into()))?;

    // Split the string by the "." character
    let (dollars_str, cents_str) = amount_str
        .split_once('.')
        .ok_or_else(|| CurrencyError::InvalidAmountError(input.into()))?;

    // Parse the strings as numbers
    let dollars =
        u64::from_str(dollars_str).map_err(|_| CurrencyError::InvalidAmountError(input.into()))?;
    let cents =
        u64::from_str(cents_str).map_err(|_| CurrencyError::InvalidAmountError(input.into()))?;

    // Return everything in cents
    Ok(dollars * 100 + cents)
}

#[cfg(test)]
mod test {
    use super::{cents_to_dollar_string, dollar_string_to_cents};

    #[test]
    fn test_dollar_string_to_cents() {
        assert_eq!(dollar_string_to_cents("$0.1").unwrap(), 1);
        assert_eq!(dollar_string_to_cents("$0.01").unwrap(), 1);
        assert_eq!(dollar_string_to_cents("$0.10").unwrap(), 10);
        assert_eq!(dollar_string_to_cents("$1.00").unwrap(), 100);
    }

    #[test]
    fn test_cents_to_dollar_string() {
        assert_eq!(cents_to_dollar_string(0), String::from("$0.00"));
        assert_eq!(cents_to_dollar_string(10), String::from("$0.10"));
        assert_eq!(cents_to_dollar_string(100), String::from("$1.00"));
        assert_eq!(cents_to_dollar_string(10000), String::from("$100.00"));
    }
}
