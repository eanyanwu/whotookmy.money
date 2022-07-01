import assert from "assert";
import * as curr from "./currency";

describe("dollarStringToCents", () => {
  it("converts properly", () => {
    assert.equal(curr.toCents("$.00"), 0);
    assert.equal(curr.toCents("$0.1"), 10);
    assert.equal(curr.toCents("$0.01"), 1);
    assert.equal(curr.toCents("$0.10"), 10);
    assert.equal(curr.toCents("$1.00"), 100);
    assert.equal(curr.toCents("$10"), 1000);
    assert.equal(curr.toCents("100"), 10000);
    assert.equal(curr.toCents("1,900.00"), 190000);
  });

  it("throw on invalid input", () => {
    // must have a dollar sign
    assert.throws(() => curr.toCents("$invalid"), curr.InvalidDollarString);
  });
});

describe("centsToDollarString", () => {
  it("converts properly", () => {
    assert.equal(curr.toDollarString(0), "0.00");
    assert.equal(curr.toDollarString(10), "0.10");
    assert.equal(curr.toDollarString(100), "1.00");
    assert.equal(curr.toDollarString(10000), "100.00");
  });

  it("throws on invalid cents amount", () => {
    assert.throws(() => curr.toDollarString(1.1), curr.InvalidCentsAmount);
  });
});
