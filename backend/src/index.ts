import type { Socket } from "net";
import http from "http";
import setup_router from "find-my-way";
import config from "./config";
import { postmark } from "./http_handlers";
import type { HttpHandlerResponse } from "./http_handlers";
import { debug, info, timer, elapsed } from "./log";

const router = setup_router({
  ignoreTrailingSlash: true,
  defaultRoute: (req, res) => {
    res.statusCode = 404;
    res.end();
  },
});

router.on("POST", "/postmark_webhook", (req, res, params) => {
  return postmark(req, res);
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

server.on("listening", () => {
  info(`server listening on port: ${PORT}`);
  elapsed("server-start");
});

server.on("connection", (socket: Socket) => {
  socket.setKeepAlive(true);
});

timer("server-start");
const PORT = config.get("server").port;
server.listen(PORT, "127.0.0.1");
