import fs from "fs/promises";
import Mustache from "mustache";
import path from "path";
import { modifyPurchase } from "../core";
import * as curr from "../currency";
import { dailySpend, type User } from "../data";
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
  const period = 13;
  const spend = dailySpend(user, period);

  const maxSpend = spend
    .map((s) => s.spend)
    .reduce((a, b) => Math.max(a, b), -Infinity);

  // The y-axis interval depends on how much the max spend is.
  // For now, keep the logic simple
  const yAxisInterval = maxSpend > 1000_00 ? 400_00 : 100_00;
  const yAxisHeight = Math.ceil(maxSpend / yAxisInterval) * yAxisInterval;
  const yAxisDivisions = [];
  for (let i = yAxisInterval; i <= yAxisHeight; i += yAxisInterval) {
    yAxisDivisions.push({
      tick: i / 100,
    });
  }
  yAxisDivisions.reverse();

  const totalSpend = spend.map((s) => s.spend).reduce((a, b) => a + b, 0);

  const transformedSpend = spend.map(({ date, spend, purchases }) => {
    return {
      day: date.day,
      dayOfWeek: date.weekdayShort,
      date: date.toISODate(),
      spendInDollars: curr.toDollarString(spend),
      percentageOfMaxSpend: Math.ceil((spend / yAxisHeight) * 100),
      purchases: purchases.map((p) => ({
        id: p.purchaseId,
        merchant: p.merchant,
        amount: curr.toDollarString(p.amountInCents),
        showSave: !p.isAmended,
        showUndo: p.isAmended,
      })),
    };
  });

  const view = {
    email: user.userEmail,
    userId: user.userId,
    spend: transformedSpend,
    totalSpend: curr.toDollarString(totalSpend),
    period,
    yAxisDivisions,
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
