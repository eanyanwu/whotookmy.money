import convict from "convict";

const config = convict({
  emailDomain: {
    doc: "The domain our application acts as",
    default: "dev.whotookmy.money",
    env: "EMAIL_DOMAIN",
  },
  postmarkToken: {
    doc: "Token for using the postmark API",
    default: "POSTMARK_API_TEST",
    env: "POSTMARK_API_TOKEN",
  },
  wtmmMacKey: {
    doc: "Key used to generate message authentication codes",
    default: "RpWmx32XfrKLlHMzdiDVnSSIjZX6gzQw3YKY9Tf+Nts=",
    env: "WTMM_MAC_KEY",
  },
  server: {
    dbFile: {
      doc: "Database file name",
      default: "wtmm.db",
      env: "DB_FILE",
    },
    port: {
      doc: "The port on which to bind wtmm_server",
      format: "port",
      default: 8080,
      env: "PORT",
    },
  },
});

export default config;
