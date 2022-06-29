import setup_router from "find-my-way";
import http from "http";
import {
  checkCookieAuthentication,
  checkURLAuthentication,
} from "./authentication";
import type { User } from "./data";
import type { HttpHandlerResponse } from "./http_handlers";
import { dashboard, postmark, staticFile } from "./http_handlers";
import * as log from "./log";
import * as server from "./server";

type RouteContext = {
  user?: User;
};

const router = setup_router({
  ignoreTrailingSlash: true,
  defaultRoute: (_req, _res) => {
    return Promise.resolve({ statusCode: 404 });
  },
});

type CreateWtmmServerOptions = Omit<
  server.CreateServerAsyncOptions,
  "onRequest"
>;
/* Sets up the wtmm server to listen for postmark webhooks and dashboard requests */
export const createWtmmServer = (
  opts: CreateWtmmServerOptions
): Promise<http.Server> => {
  router.on("POST", "/postmark_webhook", async (req, _res, _params) => {
    let payload = await server.readRequestPayload(req);
    return postmark({ payload });
  });

  router.on("GET", "/login", async (req, res) => {
    const [authenticated, mac, user] = checkURLAuthentication(req);

    if (!authenticated || !mac || !user) {
      return { statusCode: 401 };
    }

    return {
      statusCode: 302,
      headers: {
        Location: "/dashboard",
        "Set-Cookie": [
          `id=${user.userId};Max-Age=2147483647`,
          `mac=${mac};Max-Age=2147483647`,
        ],
      },
    };
  });

  router.on(
    ["GET", "POST"],
    "/dashboard",
    async function (this: RouteContext, req, _res) {
      let form = undefined;
      if (req.method === "POST") {
        try {
          form = await server.readFormData(req);
        } catch (err) {
          return { statusCode: 400 };
        }
      }
      return dashboard({ user: this.user!, form });
    }
  );

  /* Serve static assets */
  router.on("GET", "/public/*", (req, _res) => {
    const requestedURL = req.url!.slice(7);
    return staticFile({ url: requestedURL });
  });

  const onRequest = async (
    req: http.IncomingMessage,
    res: http.ServerResponse
  ) => {
    const anonymousRoutes = ["/postmark_webhook", "/login"];

    let context: RouteContext = { user: undefined };

    if (!anonymousRoutes.some((r) => req.url!.includes(r))) {
      const [authenticated, user] = checkCookieAuthentication(req);
      if (!authenticated) {
        log.info(`${req.method}`, `${req.url}`, `${401}`);
        res.writeHead(401);
        res.end();
        return;
      }

      context["user"] = user;
    }

    const response: HttpHandlerResponse = await router.lookup(
      req,
      res,
      context
    );

    log.info(
      `${req.method}`,
      `${req.url}`,
      `${response.statusCode}`,
      `${response.data ? response.data.length : 0}`
    );

    res.writeHead(response.statusCode, { ...response.headers });
    res.end(response.data);
  };

  return server.createServerAsync({ ...opts, onRequest });
};
