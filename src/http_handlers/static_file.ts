import fs from "fs/promises";
import path from "path";
import type { HttpHandlerResponse } from "./http_handler";

type StaticFilesArgs = {
  url: string;
};

const EXTENSION_TO_MIME: Record<string, string> = {
  ".txt": "text/plain",
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
};

export const staticFile = async ({
  url,
}: StaticFilesArgs): Promise<HttpHandlerResponse> => {
  const decoded = decodeURIComponent(url);
  // search for static files in this folder
  const staticFileSearchDir = path.join(__dirname, "../assets");

  // No directory listings
  // No relative paths
  // Nothing weird like /nothing/to/see/c:/Program\ Files\ (x86)
  if (url.endsWith("/") || url.includes("..") || url.includes(":")) {
    return {
      statusCode: 404,
    };
  }

  const pathToFile = path.join(staticFileSearchDir, url);
  const extension = path.extname(pathToFile);

  if (!extension) {
    return { statusCode: 404 };
  }

  const mimeType = EXTENSION_TO_MIME[extension];

  if (!mimeType) {
    return { statusCode: 404 };
  }

  try {
    const file = await fs.readFile(pathToFile, { encoding: "utf-8" });
    return {
      statusCode: 200,
      headers: {
        "Content-Type": mimeType,
      },
      data: file,
    };
  } catch (_err) {
    return { statusCode: 404 };
  }
};
