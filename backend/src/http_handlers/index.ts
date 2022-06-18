import type { IncomingMessage, ServerResponse } from "http";
import { Buffer } from "buffer";
import type { Buffer as BufferType } from "buffer";

/* Returns the request payload as a `Buffer` */
const readRequestPayload = (req: IncomingMessage): Promise<BufferType> => {
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

export type Response = {
  statusCode: number;
  headers?: object;
  data?: string;
};

type PostmarkAddress = {
  Email: string;
  Name: string;
};

type InboundPostmarkEmail = {
  FromFull: PostmarkAddress | PostmarkAddress[];
  ToFull: PostmarkAddress | PostmarkAddress[];
  Subject: string;
  MessageID: string;
  TextBody: string;
  HtmlBody: string;
};

function isInboundPostmarkEmail(
  p: InboundPostmarkEmail | any
): p is InboundPostmarkEmail {
  let maybePostmarkEmail = p as InboundPostmarkEmail;
  return (
    maybePostmarkEmail.FromFull !== undefined &&
    maybePostmarkEmail.ToFull !== undefined &&
    maybePostmarkEmail.Subject !== undefined &&
    maybePostmarkEmail.MessageID !== undefined &&
    maybePostmarkEmail.TextBody !== undefined &&
    maybePostmarkEmail.HtmlBody !== undefined
  );
}

const postmark = async (
  req: IncomingMessage,
  res: ServerResponse
): Promise<Response> => {
  let payload = await readRequestPayload(req);
  let json;
  try {
    json = JSON.parse(payload.toString());
  } catch (_) {
    // Assumption: Postmark will always send us valid JSON
    return { statusCode: 400 };
  }

  if (isInboundPostmarkEmail(json)) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/plain" },
      data: "OK",
    };
  } else {
    // Assumption: Postmark will always send us JSON that conforms to the email schema
    return { statusCode: 400 };
  }
};

export { postmark };
