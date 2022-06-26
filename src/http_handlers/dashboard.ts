import { formatISO, fromUnixTime, getDay, parseISO } from "date-fns";
import fs from "fs/promises";
import Mustache from "mustache";
import path from "path";
import { centsToDollarString } from "../currency";
import {
  dailySpend,
  getRecentPurchases,
  lookupUser,
  NoRowsReturned,
} from "../data";
import { WEEKDAYS } from "../datetime";
import * as log from "../log";
import type { HttpHandlerResponse } from "./http_handler";

type DashboardHandlerArgs = {
  userId: number;
};

/* Render a user's dashboard */
export const dashboard = async ({
  userId,
}: DashboardHandlerArgs): Promise<HttpHandlerResponse> => {
  const template = await fs.readFile(
    path.join(__dirname, "../templates/dashboard.html"),
    {
      encoding: "utf-8",
    }
  );
  let user;

  try {
    user = lookupUser({ id: userId });
  } catch (err) {
    if (err instanceof NoRowsReturned) {
      log.error({ userId }, "user does not exist");
      return { statusCode: 404 };
    }
    throw err;
  }

  // Only display purchases from the past 10 days
  const period = 10;
  const spend = dailySpend(user, period);
  const purchases = getRecentPurchases(user, period);

  const maxSpend = spend
    .map((s) => s.spend)
    .reduce((a, b) => Math.max(a, b), -Infinity);

  const totalSpend = spend.map((s) => s.spend).reduce((a, b) => a + b, 0);

  const transformedSpend = spend.map(({ day, spend }) => {
    return {
      date: day,
      day: parseISO(day).getDate().toString().padStart(2, "0"),
      dayOfWeek: WEEKDAYS[getDay(parseISO(day))].slice(0, 3).toLowerCase(),
      spendInDollars: centsToDollarString(spend),
      percentageOfMaxSpend: Math.floor((spend / maxSpend) * 100),
    };
  });

  type PurchaseView = { merchant: string; amount: string };
  let purchaseByDate = purchases.reduce(
    (acc: Record<string, PurchaseView[]>, curr) => {
      const date = formatISO(fromUnixTime(curr.timestamp), {
        representation: "date",
      });
      if (!acc[date]) {
        acc[date] = [
          {
            merchant: curr.merchant,
            amount: centsToDollarString(curr.amountInCents),
          },
        ];
      } else {
        acc[date].push({
          merchant: curr.merchant,
          amount: centsToDollarString(curr.amountInCents),
        });
      }
      return acc;
    },
    {}
  );

  // transform the dictionary to an array for easier templating
  let purchaseListByDate = [];
  for (const [key, vals] of Object.entries(purchaseByDate)) {
    purchaseListByDate.push({
      date: key,
      purchases: vals,
    });
  }

  const view = {
    email: user.userEmail,
    spend: transformedSpend,
    totalSpend: centsToDollarString(totalSpend),
    purchaseByDate: purchaseListByDate,
    period,
  };

  const output = Mustache.render(template, view);
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/html",
    },
    data: output,
  };
};
