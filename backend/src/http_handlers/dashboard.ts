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
    path.join(__dirname, "../../src/templates/dashboard.html"),
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
  const spend = dailySpend(user);
  const maxSpend = spend
    .map((s) => s.spend)
    .reduce((a, b) => Math.max(a, b), -Infinity);

  const transformedSpend = spend.map(({ day, spend }) => {
    return {
      day,
      dayOfWeek: WEEKDAYS[getDay(parseISO(day))].slice(0, 3),
      spend,
      spendInDollars: centsToDollarString(spend),
      percentageOfMaxSpend: Math.floor((spend / maxSpend) * 100),
    };
  });

  const view = {
    email: user.userEmail,
    spend: transformedSpend,
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
