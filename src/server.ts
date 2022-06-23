import type { Buffer as BufferType } from "buffer";
import { Buffer } from "buffer";
import setup_router from "find-my-way";
import type { IncomingMessage } from "http";
import http from "http";
import type { Socket } from "net";
import net from "net";
import { verifyMac } from "./crypto";
import type { HttpHandlerResponse } from "./http_handlers";
import { dashboard, postmark } from "./http_handlers";
import { elapsed, info, timer } from "./log";

type CreateServerOptions = {
  host: string;
  port: number;
  onListen: (err?: Error, server?: http.Server) => void;
  onRequest: (req: http.IncomingMessage, res: http.ServerResponse) => void;
};

// Creates generic server that calls `onListen` once it starts listening. requests
// to the server are sent to the `onRequest` callback
export const createServer = (opts: CreateServerOptions) => {
  const server = http.createServer();
  server.on("request", opts.onRequest);
  server.on("listening", () => {
    // save coercion as listening on an IP port always returns AddressInfo
    const { port, address } = server.address() as net.AddressInfo;
    info(`server listening on: ${address}:${port}`);
    opts.onListen(undefined, server);
  });
  server.on("error", (err) => {
    opts.onListen(err, undefined);
  });
  server.on("connection", (socket: Socket) => {
    socket.setKeepAlive(true);
  });
  server.listen(opts.port, opts.host);
};

type CreateServerAsyncOptions = Omit<CreateServerOptions, "onListen">;
// Promisified version of `setupServer`. Promise resolves with the server
// instance once the server is up and listening
export const createServerAsync = (
  opts: CreateServerAsyncOptions
): Promise<http.Server> => {
  return new Promise((resolve, reject) => {
    createServer({
      host: opts.host,
      port: opts.port,
      onRequest: opts.onRequest,
      onListen: (err, server) => {
        if (err) {
          reject(err);
          return;
        }
        if (server) {
          resolve(server);
          return;
        }
      },
    });
  });
};

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

type CreateWtmmServerOptions = Omit<CreateServerAsyncOptions, "onRequest">;
/* Sets up the wtmm server to listen for postmark webhooks and dashboard requests */
export const createWtmmServer = (
  opts: CreateWtmmServerOptions
): Promise<http.Server> => {
  router.on("POST", "/postmark_webhook", async (req, res, params) => {
    let payload = await readRequestPayload(req);
    return postmark({ payload });
  });

  router.on("GET", "/dashboard", async (req, res, params) => {
    let url = req.url!;
    let qsIdx = url.indexOf("?");

    if (qsIdx === -1) {
      return { statusCode: 404 };
    }

    let qs = new URLSearchParams(url.slice(qsIdx));
    let userIdStr = qs.get("id");
    let mac = qs.get("mac");

    if (!userIdStr || !mac) {
      return { statusCode: 404 };
    }

    let userId = Number.parseInt(userIdStr);
    if (Number.isNaN(userId)) {
      return { statusCode: 404 };
    }

    /* Rationale: Message Authentication Codes are used to verify that (a) a
     * message wasn't tampered with and (b) that it came from the person you
     * expected it to (i.e. it's valid) I don't think I need to actually secure my
     * dashboard endpoint, but I also don't want someone to be able to enumerate
     * through dashboards by userID, or by trying different user emails. Creating a
     * MAC for the email and including it in the dashboard link proves that it was I
     * who generated the link*/
    if (!verifyMac(userIdStr, mac)) {
      return { statusCode: 404 };
    }

    return dashboard({ userId });
  });

  const onRequest = async (
    req: http.IncomingMessage,
    res: http.ServerResponse
  ) => {
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
  };

  return createServerAsync({ ...opts, onRequest });
};
