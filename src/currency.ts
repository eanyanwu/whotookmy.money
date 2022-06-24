export class InvalidDollarString extends Error {
  constructor(str: string) {
    super("invalid dollar string. could not parse " + str);
  }
}

export const centsToDollarString = (i: number): string => {
  let dollarStr = i.toString().split("");
  let len = dollarStr.length;

  // Place a leading 0 in front of single cents
  if (len === 1) {
    len = dollarStr.unshift("0");
  }

  // Place the period
  dollarStr.splice(len - 2, 0, ".");

  // If the string was exactly 2 digits, place a leading 0
  if (len == 2) {
    dollarStr.unshift("0");
  }

  return dollarStr.join("");
};

/* Converts a dollar string (e.g. $100.00) into cents */
export const dollarStringToCents = (i: string): number => {
  let str: string = i;
  // Strip the leading $
  if (str.startsWith("$")) {
    str = str.slice(1);
  } else {
    throw new InvalidDollarString(i);
  }

  const [dollar_str, cents_str] = str.split(".");
  if (dollar_str === undefined || cents_str === undefined) {
    throw new InvalidDollarString(i);
  }

  const dollars = Number.parseInt(dollar_str);
  const cents = Number.parseInt(cents_str);

  if (Number.isNaN(dollars) || Number.isNaN(cents)) {
    throw new InvalidDollarString(i);
  }

  return dollars * 100 + cents;
};
