import config from "./config";
import { open } from "./db";
import { info } from "./log";
import { createServer } from "./server";

// Migrate the database if needed
open();

// Start the server
const server = createServer();
const PORT = config.get("server").port;
server.listen(PORT, "127.0.0.1", () => {
  info(`server listening on port: ${PORT}`);
});
