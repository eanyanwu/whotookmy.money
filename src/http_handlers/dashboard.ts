import fs from "fs/promises";
import Mustache from "mustache";
import path from "path";
import { modifyPurchase } from "../core";
import { centsToDollarString } from "../currency";
import { dailySpend, type User } from "../data";
import * as log from "../log";
import type { HttpHandlerResponse } from "./http_handler";

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
    modifyPurchase(form);
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
