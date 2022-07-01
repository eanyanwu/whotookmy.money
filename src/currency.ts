import Big from "big.js";

export class InvalidDollarString extends Error {
  constructor(str: string) {
    super("invalid dollar string:" + str);
  }
}

export class InvalidCentsAmount extends Error {
  constructor(n: number) {
    super("number is not valid cents:" + n);
  }
}

const stripDollarSign = (d: string) => {
  if (d[0] === "$") {
    return d.slice(1);
  }
  return d;
};

const stripCommaDelimiter = (d: string) => {
  return d.replace(",", "");
};

const addDollarSign = (d: string) => {
  return "$" + d;
};

/* Convert a dollar string to cents
 * Any reasonable representation should be accepted:
 * $0.10 | .20 | $0.1 | 100 | $1000 etc..
 */
export const toCents = (d: string) => {
  const dollarString = stripCommaDelimiter(stripDollarSign(d));
  try {
    return Number.parseInt(Big(dollarString).times(100).toFixed(0));
  } catch (err: any) {
    throw new InvalidDollarString(err.message);
  }
};

/* Convert from cents to a dollar string
 * Input should be an integer
 * */
export const toDollarString = (i: number) => {
  if (!Number.isInteger(i)) {
    throw new InvalidCentsAmount(i);
  }

  return Big(i).div(Big(100)).toFixed(2).toString();
};
