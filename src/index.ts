import config from "./config";
import { open_and_init } from "./db";
import { createOutboxMonitor } from "./outbox";
import { createWtmmServer } from "./wtmm_server";

// Migrate the database if needed
open_and_init();

// Start the server
const PORT = config.get("server.port");
const ADDRESS = config.get("server.address");
const server = createWtmmServer({
  host: ADDRESS,
  port: PORT,
});

// Start checking for unsent emails
const monitor = createOutboxMonitor();
monitor.start();
