import assert from "assert";
import { sendHttpRequestAsync } from "./http_request";
import { createServerAsync, readRequestPayload } from "./server";

describe("sendHttpRequestAsync", () => {
  it("can make an http request", async () => {
    const server = await createServerAsync({
      host: "localhost",
      port: 8080,
      onRequest: (req, res) => {
        res.end("HELLO");
      },
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
    const server = await createServerAsync({
      host: "localhost",
      port: 8080,
      onRequest: async (req, res) => {
        const payload = await readRequestPayload(req);
        assert.equal(payload.toString(), "HELLO");
        res.end();
      },
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
    const server = await createServerAsync({
      host: "localhost",
      port: 8080,
      onRequest: (req, res) => {
        assert.equal(req.headers["hello"], "world");
        res.end();
      },
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
