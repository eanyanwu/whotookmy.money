import parse from "date-fns/parse";

/* Parse an RFC 2822 date */
export const parseRfc2822 = (i: string): [Date, number] => {
  // Some emails might contain a trailing timezone indicator in parens (e.g. EST)
  // This doesn't conform to the standard at worst, and is obsolete at best.
  // Chop of that part and parse the rest
  let dateString = i;
  let parensIdx = dateString.indexOf("(");
  if (parensIdx !== -1) {
    dateString = dateString.slice(0, parensIdx - 1);
  }

  // Extract the 4 digit zone specification
  const parts = dateString.split(" ");

  // Convert it to seconds
  const zone = (parts.pop() as string).split("");
  const hours = Number.parseInt([zone[1], zone[2]].join(""));
  const minutes = Number.parseInt([zone[3], zone[4]].join(""));
  const isNegative = zone[0] === "-";
  const seconds = (isNegative ? -1 : 1) * (hours * 60 * 60 + minutes * 60);

  const date = parse(dateString, "EEE, dd MMM yyyy HH:mm:ss XX", new Date());

  return [date, seconds];
};

/* Convert a date to unix timestamp */
export const toUnixTimestamp = (d: Date): number => {
  return Math.floor(d.getTime() / 1000);
};

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
