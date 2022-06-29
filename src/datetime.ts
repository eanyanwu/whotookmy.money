import { DateTime } from "luxon";

/* Parse an RFC 2822 date into a unix timestamp + offset */
export const parseRfc2822 = (i: string): [number, number] => {
  // Some emails might contain a trailing timezone indicator in parens (e.g. EST)
  // This doesn't conform to the standard at worst, and is obsolete at best.
  // Chop of that part and parse the rest
  let dateString = i;
  let parensIdx = dateString.indexOf("(");
  if (parensIdx !== -1) {
    dateString = dateString.slice(0, parensIdx - 1);
  }

  const date = DateTime.fromRFC2822(dateString, { setZone: true });

  return [date.toUnixInteger(), date.offset * 60];
};

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
