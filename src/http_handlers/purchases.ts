import fs from "fs/promises";
import Mustache from "mustache";
import path from "path";
import { type User } from "../data";
import type { HttpHandlerResponse } from "./http_handler";

export const purchases = async (user: User): Promise<HttpHandlerResponse> => {
  const template = await fs.readFile(
    path.join(__dirname, "../templates/purchases.html"),
    {
      encoding: "utf-8",
    }
  );
  const output = Mustache.render(template, {});

  return {
    statusCode: 200,
    headers: { "Content-Type": "text/html" },
    data: output,
  };
};
