import type { Buffer as BufferType } from "buffer";
import { Buffer } from "buffer";
import setup_router from "find-my-way";
import type { IncomingMessage } from "http";
import http from "http";
import type { Socket } from "net";
import type { HttpHandlerResponse } from "./http_handlers";
import { postmark } from "./http_handlers";
import { elapsed, info, timer } from "./log";

const router = setup_router({
  ignoreTrailingSlash: true,
  defaultRoute: (req, res) => {
    return Promise.resolve({ statusCode: 404 });
  },
});

/* Reads and returns the request payload as a `Buffer` */
export const readRequestPayload = (
  req: IncomingMessage
): Promise<BufferType> => {
  return new Promise((resolve, reject) => {
    const chunks: BufferType[] = [];
    const onError = (e: Error) => {
      reject(e);
    };
    const onData = (chunk: BufferType) => {
      chunks.push(chunk);
    };
    const onEnd = () => {
      resolve(Buffer.concat(chunks));
    };

    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
  });
};

export const createServer = () => {
  router.on("POST", "/postmark_webhook", async (req, res, params) => {
    let payload = await readRequestPayload(req);
    return postmark({ payload });
  });

  let server = http.createServer(async (req, res) => {
    timer("request-duration");
    const response: HttpHandlerResponse = await router.lookup(req, res);

    info(
      `${req.method}`,
      `${req.url}`,
      `${response.statusCode}`,
      `${response.data ? response.data.length : 0}`
    );

    res.writeHead(response.statusCode, { ...response.headers });
    res.end(response.data);

    elapsed("request-duration");
  });

  server.on("connection", (socket: Socket) => {
    socket.setKeepAlive(true);
  });

  return server;
};
