import * as curr from "../currency";
import { amendPurchase, lookupPurchase, undoPurchaseAmendment } from "../data";
import * as log from "../log";

export class MalformedPurchaseForm extends Error {
  constructor(form: Record<string, string>) {
    super(`invalid form: ${form}`);
  }
}

/* Creates or updates purchase amendments according to a form submission */
export const modifyPurchase = (form: Record<string, string>) => {
  let properties = ["id", "merchant", "amount", "action"];

  if (!Object.keys(form).every((k) => properties.includes(k))) {
    log.error(form, "unrecognized properties in submitted form");
    throw new MalformedPurchaseForm(form);
  }

  // It's ok for merchant to be an empty string
  const merchant = form["merchant"] || "";

  // The only allowed actions are save and undo
  if (!["save", "undo"].includes(form["action"])) {
    log.error(form, "invalid form action");
    throw new MalformedPurchaseForm(form);
  }

  const id = Number.parseInt(form["id"]);
  if (Number.isNaN(id)) {
    log.error(form, "could not parse form id");
    throw new MalformedPurchaseForm(form);
  }

  const dollarString = `\$${form["amount"]}`;
  let amountInCents = 0;
  try {
    amountInCents = curr.toCents(dollarString);
  } catch (err) {
    log.error(form, "could not parse amount");
    throw new MalformedPurchaseForm(form);
  }

  const purchase = lookupPurchase({ id: id });
  if (form["action"] === "undo") {
    undoPurchaseAmendment({ id });
  } else {
    amendPurchase({
      purchaseId: id,
      newAmountInCents: amountInCents,
      newMerchant: merchant,
    });
  }
};
