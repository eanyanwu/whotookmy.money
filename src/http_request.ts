import { Buffer, type Buffer as BufferType } from "buffer";
import http, { type IncomingMessage } from "http";
import https from "https";
import * as log from "./log";

type RequestArgs = {
  url: string;
  headers?: Record<string, string>;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  data?: BufferType;
};

type RequestCallback = (e?: Error, d?: HttpResponse) => void;
type HttpResponse = {
  status: number;
  data: BufferType;
};

/* Register a callback to handle reading the body of an incoming http message */
const onIncomingHttpMessage = (msg: IncomingMessage, cb: RequestCallback) => {
  const chunks: BufferType[] = [];
  const onError = (e: Error) => {
    cb(e);
  };
  const onData = (chunk: BufferType) => {
    chunks.push(chunk);
  };
  const onEnd = function (this: IncomingMessage) {
    const data = Buffer.concat(chunks);
    // Status code must be defined here because we got this
    // from an `http.ClientRequest`
    const status = this.statusCode as number;
    cb(undefined, { status, data });
  };

  msg.on("data", onData);
  msg.on("end", onEnd);
  msg.on("error", onError);
};

/* Send an http request and register a callback to handle the response  */
export const sendHttpRequest = (
  { url, headers, method, data }: RequestArgs,
  cb: RequestCallback
) => {
  let req;
  if (url.startsWith("https://")) {
    req = https.request(url, { method, headers }, (res: IncomingMessage) => {
      onIncomingHttpMessage(res, cb);
    });
  } else {
    req = http.request(url, { method, headers }, (res: IncomingMessage) => {
      onIncomingHttpMessage(res, cb);
    });
  }

  req.on("error", (err: Error) => {
    cb(err, undefined);
  });

  if (headers) {
    for (const [key, val] of Object.entries(headers)) {
      req.setHeader(key, val);
    }
  }

  if (data) {
    req.setHeader("Content-Length", Buffer.byteLength(data));
    req.write(data);
  }

  req.end();
};

// Normally, i'd use `util.promisify to do this. But because of type
// shenanigans, Typescript will think the return type is
// `Promise<HttpResponse|undefined>` There isn't really a way to express that
// the callback will always be either an error or a response, and not both, and
// not neither.
export const sendHttpRequestAsync = (
  args: RequestArgs
): Promise<HttpResponse> => {
  log.debug({ httpRequest: args });
  return new Promise((resolve, reject) => {
    sendHttpRequest(args, (err, resp) => {
      if (err) {
        reject(err);
        return;
      }

      if (resp) {
        log.debug({ httpResponse: resp });
        resolve(resp);
        return;
      }
    });
  });
};
