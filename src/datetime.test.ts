import assert from "assert";
import { parseRfc2822 } from "./datetime";

describe("parseRfc2822", () => {
  it("corectly parses a date", () => {
    const withTz = "Sat, 18 Jun 2022 04:18:29 +0400 (EDT)";
    const withoutTz = "Sat, 18 Jun 2022 22:20:20 -1030";

    const [date1, offset1] = parseRfc2822(withTz);
    assert.equal(date1, 1655511509);
    assert.equal(offset1, 14400);

    const [date2, offset2] = parseRfc2822(withoutTz);
    assert.equal(date2, 1655628620);
    assert.equal(offset2, -37800);
  });
});
