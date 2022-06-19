import assert from "assert";
import { parseRfc2822, toUnixTimestamp } from "./datetime";

describe("parseRfc2822", () => {
  it("corectly parses a date", () => {
    const withTz = "Sat, 18 Jun 2022 04:18:29 +0400 (EDT)";
    const withoutTz = "Sat, 18 Jun 2022 22:20:20 -1030";

    const [date1, offset1] = parseRfc2822(withTz);
    assert.equal(offset1, 14400);

    const [date2, offset2] = parseRfc2822(withoutTz);
    assert.equal(offset2, -37800);
  });
});

describe("toUnixTimestamp", () => {
  it("converts a date to a Unix timestamp", () => {
    let date = new Date(2022, 5, 18, 13, 21, 27);
    let timestamp = toUnixTimestamp(date);

    assert.equal(timestamp, 1655572887);
  });
});
