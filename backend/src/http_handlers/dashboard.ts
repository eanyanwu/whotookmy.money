import fs from "fs/promises";
import Mustache from "mustache";
import { dailySpend, lookupUser } from "../data";
import type { HttpHandlerResponse } from "./http_handler";

type DashboardHandlerArgs = {
  userId: number;
};
/* Render a user's dashboard */
export const dashboard = async ({
  userId,
}: DashboardHandlerArgs): Promise<HttpHandlerResponse> => {
  const template = await fs.readFile("./templates/dashboard.html", {
    encoding: "utf-8",
  });

  const user = lookupUser({ id: userId });
  const spend = dailySpend(user);

  const output = Mustache.render(template, {});
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/html",
    },
    data: output,
  };
};
