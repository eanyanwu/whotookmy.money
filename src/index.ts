import config from "./config";
import { open_and_init } from "./db";
import { createOutboxMonitor } from "./outbox";
import { createWtmmServer } from "./wtmm_server";

// Migrate the database if needed
open_and_init();

// Start the server
const PORT = config.get("server").port;
const server = createWtmmServer({
  host: "127.0.0.1",
  port: PORT,
});

// Start checking for unsent emails
const monitor = createOutboxMonitor();
monitor.start();
