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

const postmark = async (req: IncomingMessage, res: ServerResponse) => {
  let payload = await readRequestPayload(req);
  let json = payload.toString();
  console.log({ json });
  res.end();
};

export { postmark };
