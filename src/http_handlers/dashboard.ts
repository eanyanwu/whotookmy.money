import getDay from "date-fns/getDay";
import parseISO from "date-fns/parseISO";
import fs from "fs/promises";
import Mustache from "mustache";
import path from "path";
import { centsToDollarString } from "../currency";
import { dailySpend, lookupUser, NoRowsReturned } from "../data";
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

  const period = 10;
  const spend = dailySpend(user, period);
  const maxSpend = spend
    .map((s) => s.spend)
    .reduce((a, b) => Math.max(a, b), -Infinity);
  const totalSpend = spend.map((s) => s.spend).reduce((a, b) => a + b, 0);

  const transformedSpend = spend.map(({ day, spend }) => {
    return {
      day: parseISO(day).getDate().toString().padStart(2, "0"),
      dayOfWeek: WEEKDAYS[getDay(parseISO(day))].slice(0, 3).toLowerCase(),
      spendInDollars: centsToDollarString(spend),
      percentageOfMaxSpend: Math.floor((spend / maxSpend) * 100),
    };
  });

  const view = {
    email: user.userEmail,
    spend: transformedSpend,
    totalSpend: centsToDollarString(totalSpend),
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
