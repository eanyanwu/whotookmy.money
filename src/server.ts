import type { Buffer as BufferType } from "buffer";
import { Buffer } from "buffer";
import busboy from "busboy";
import http from "http";
import type { Socket } from "net";
import net from "net";
import * as log from "./log";

export type CreateServerOptions = {
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
    log.info(`server listening on: ${address}:${port}`);
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

export type CreateServerAsyncOptions = Omit<CreateServerOptions, "onListen">;
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

/* Read a multiplart/form-data payload from the request */
export const readFormData = (
  req: http.IncomingMessage
): Promise<Record<string, string>> => {
  return new Promise((resolve, reject) => {
    let form: Record<string, string> = {};
    const bb = busboy({ headers: req.headers });

    bb.on("field", (name, value) => {
      if (!form) {
        form = {};
      }
      form[name] = value;
    });

    bb.on("error", (err) => {
      reject(err);
    });

    bb.on("close", () => {
      resolve(form);
    });

    req.pipe(bb);
  });
};

/* Reads and returns the request payload as a `Buffer` */
export const readRequestPayload = (
  req: http.IncomingMessage
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
