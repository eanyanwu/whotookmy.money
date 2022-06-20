import assert from "assert";
import http from "http";
import { sendHttpRequestAsync } from "./http_request";
import { readRequestPayload } from "./server";

/* Setting up a utility method `setupServerAsync`  to spin up a test server for
 * requests to hit*/

type OnListeningCallback = (err?: Error, server?: http.Server) => void;
type OnRequestCallback = (
  req: http.IncomingMessage,
  res: http.ServerResponse
) => void;

// Creates a server that calls `onListning` once it starts listening. requests
// to the server are sent to the onRequest callback
const setupServer = (
  onRequest: OnRequestCallback,
  onListening: OnListeningCallback
) => {
  const server = http.createServer((req, res) => {
    onRequest(req, res);
  });
  server.listen(8080, "localhost", function (this: http.Server) {
    onListening(undefined, this);
  });
  server.on("error", (err) => {
    onListening(err);
  });
};

// Promisified version of `setupServer`  Promise resolves (with the server
// instance) once the server is up and listening
const setupServerAsync = (
  onRequest: OnRequestCallback
): Promise<http.Server> => {
  return new Promise((resolve, reject) => {
    setupServer(onRequest, (err, server) => {
      if (err) {
        reject(err);
        return;
      }
      if (server) {
        resolve(server);
        return;
      }
    });
  });
};

describe("sendHttpRequestAsync", () => {
  it("can make an http request", async () => {
    const server = await setupServerAsync((req, res) => {
      res.end("HELLO");
    });

    const result = await sendHttpRequestAsync({
      url: "http://localhost:8080/",
      method: "GET",
    });

    const { status, data } = result;
    assert.equal(status, 200);
    assert.equal(data, "HELLO");

    server.close();
  });

  it("can make POST requests with data", async () => {
    const server = await setupServerAsync(async (req, res) => {
      const payload = await readRequestPayload(req);
      assert.equal(payload.toString(), "HELLO");
      res.end();
    });

    const result = await sendHttpRequestAsync({
      url: "http://localhost:8080/",
      method: "POST",
      data: Buffer.from("HELLO"),
    });

    const { status, data } = result;
    assert.equal(status, 200);

    server.close();
  });

  it("can send headers with request", async () => {
    const server = await setupServerAsync((req, res) => {
      assert.equal(req.headers["hello"], "world");
      res.end();
    });

    const result = await sendHttpRequestAsync({
      url: "http://localhost:8080/",
      method: "GET",
      headers: {
        hello: "world",
      },
    });

    const { status } = result;
    assert.equal(status, 200);

    server.close();
  });
});
