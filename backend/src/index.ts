import config from "./config";
import { open_and_init } from "./db";
import { info } from "./log";
import { createServer } from "./server";
import { createOutboxMonitor } from "./outbox";

// Migrate the database if needed
open_and_init();

// Start the server
const server = createServer();
const PORT = config.get("server").port;
server.listen(PORT, "127.0.0.1", () => {
  info(`server listening on port: ${PORT}`);
});

// Start checking for unsent emails
const monitor = createOutboxMonitor();
monitor.start();
