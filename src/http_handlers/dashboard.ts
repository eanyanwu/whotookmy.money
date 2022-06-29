import fs from "fs/promises";
import Mustache from "mustache";
import path from "path";
import { centsToDollarString } from "../currency";
import {
  amendPurchase,
  dailySpend,
  lookupPurchase,
  undoPurchaseAmendment,
  type User,
} from "../data";
import * as log from "../log";
import type { HttpHandlerResponse } from "./http_handler";

type PurchaseEdit = {
  id: number;
  merchant: string;
  amountInCents: number;
  action: "save" | "undo";
};
const parsePurchaseEdit = (
  form: Record<string, string>
): PurchaseEdit | undefined => {
  let properties = ["id", "merchant", "amount", "action"];

  if (!Object.keys(form).every((k) => properties.includes(k))) {
    log.error(form, "invalid form");
    return undefined;
  }

  const merchant = form["merchant"];

  if (form["action"] !== "save" && form["action"] !== "undo") {
    log.error(form, "invalid form action");
    return undefined;
  }

  const id = Number.parseInt(form["id"]);
  if (Number.isNaN(id)) {
    log.error(form, "could not parse form id");
    return undefined;
  }

  // TODO: should i just be using this to parse dollar amounts?
  const amountInDollars = Number.parseFloat(form["amount"]);
  if (Number.isNaN(amountInDollars)) {
    log.error(form, "could not parse form amount");
    return undefined;
  }
  const amountInCents = amountInDollars * 100;

  return {
    id,
    merchant,
    amountInCents,
    action: form["action"],
  };
};

type DashboardArgs = {
  user: User;
  form?: Record<string, string>;
};
/* Render a user's dashboard */
export const dashboard = async ({
  user,
  form,
}: DashboardArgs): Promise<HttpHandlerResponse> => {
  const template = await fs.readFile(
    path.join(__dirname, "../templates/dashboard.html"),
    {
      encoding: "utf-8",
    }
  );

  if (form) {
    // user made a change to a purchase. Validate it
    const edit = parsePurchaseEdit(form);
    if (!edit) {
      // invalid form submission
      return { statusCode: 400 };
    }

    const purchase = lookupPurchase({ id: edit.id });
    if (edit.action === "undo") {
      // delete amendment
      undoPurchaseAmendment({ id: edit.id });
    } else {
      amendPurchase({
        purchaseId: purchase.purchaseId,
        newAmountInCents: edit.amountInCents,
        newMerchant: edit.merchant,
      });
    }
  }

  // Only display purchases from the past 10 days
  const period = 10;
  const spend = dailySpend(user, period);

  const maxSpend = spend
    .map((s) => s.spend)
    .reduce((a, b) => Math.max(a, b), -Infinity);

  const totalSpend = spend.map((s) => s.spend).reduce((a, b) => a + b, 0);

  const transformedSpend = spend.map(({ date, spend, purchases }) => {
    return {
      day: date.day,
      dayOfWeek: date.weekdayShort,
      date: date.toISODate(),
      spendInDollars: centsToDollarString(spend),
      percentageOfMaxSpend: Math.floor((spend / maxSpend) * 100),
      purchases: purchases.map((p) => ({
        id: p.purchaseId,
        merchant: p.merchant,
        amount: centsToDollarString(p.amountInCents),
        showSave: !p.isAmended,
        showUndo: p.isAmended,
      })),
    };
  });

  const view = {
    email: user.userEmail,
    userId: user.userId,
    spend: transformedSpend,
    totalSpend: centsToDollarString(totalSpend),
    period,
  };

  const output = Mustache.render(template, view);
  if (form) {
    return {
      statusCode: 303,
      headers: { "Content-Type": "text/html", Location: "/dashboard" },
      data: output,
    };
  }
  return {
    statusCode: 200,
    headers: { "Content-Type": "text/html" },
    data: output,
  };
};
