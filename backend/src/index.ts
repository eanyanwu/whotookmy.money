import config from "./config";
import { open_and_init } from "./db";
import { info } from "./log";
import { createOutboxMonitor } from "./outbox";
import { createServer } from "./server";

// Migrate the database if needed
open_and_init();

// Start the server
const server = createServer();
const PORT = config.get("server").port;
server.listen(PORT, "192.168.1.234", () => {
  info(`server listening on port: ${PORT}`);
});

// Start checking for unsent emails
const monitor = createOutboxMonitor();
monitor.start();
