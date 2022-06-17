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
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end("<body>Hello World</body>");
});

let server = http.createServer((req, res) => {
  router.lookup(req, res);
});

const PORT = config.get("server").port;
console.log(`server listening on port: ${PORT}`);
server.listen(PORT);
