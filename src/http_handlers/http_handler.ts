/* A response from one of the http handlers */
export type HttpHandlerResponse = {
  statusCode: number;
  headers?: object;
  data?: string;
};
