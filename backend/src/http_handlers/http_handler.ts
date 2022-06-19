import { Buffer } from "buffer";

/* A request to one of the http handlers */
export type HttpHandlerRequest = {
  payload: Buffer;
};

/* A response from one of the http handlers */
export type HttpHandlerResponse = {
  statusCode: number;
  headers?: object;
  data?: string;
};
