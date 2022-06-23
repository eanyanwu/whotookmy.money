import assert from "assert";
import {
  centsToDollarString,
  dollarStringToCents,
  InvalidDollarString,
} from "./currency";

describe("dollarStringToCents", () => {
  it("converts properly", () => {
    assert.equal(dollarStringToCents("$0.1"), 1);
    assert.equal(dollarStringToCents("$0.01"), 1);
    assert.equal(dollarStringToCents("$0.10"), 10);
    assert.equal(dollarStringToCents("$1.00"), 100);
  });

  it("throw on invalid input", () => {
    // must have a dollar sign
    assert.throws(() => dollarStringToCents("1.0"), InvalidDollarString);
    // must have a period
    assert.throws(() => dollarStringToCents("$10"), InvalidDollarString);
  });
});

describe("centsToDollarString", () => {
  it("converts properly", () => {
    assert.equal(centsToDollarString(0), "$0.00");
    assert.equal(centsToDollarString(10), "$0.10");
    assert.equal(centsToDollarString(100), "$1.00");
    assert.equal(centsToDollarString(10000), "$100.00");
  });
});