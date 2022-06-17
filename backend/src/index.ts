import http from "http";
import setup_router from "find-my-way";
import config from "./config";

const router = setup_router({
  ignoreTrailingSlash: true,
  defaultRoute: (req, res) => {
    res.statusCode = 404;
    res.end();
  },
});

router.on("POST", "/postmark_webhook", (req, res, params) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("ok");
});

let server = http.createServer((req, res) => {
  router.lookup(req, res);
});

const PORT = config.get("server").port;
server.listen(PORT, "127.0.0.1", () => {
  console.log(`server listening on port: ${PORT}`);
});
