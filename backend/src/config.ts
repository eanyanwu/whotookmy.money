import convict from "convict";

const config = convict({
  email_domain: {
    doc: "The domain our application acts as",
    default: "dev.whotookmy.money",
    env: "EMAIL_DOMAIN",
  },
  postmark_token: {
    doc: "Token for using the postmark API",
    default: "POSTMARK_API_TEST",
    env: "POSTMARK_API_TOKEN",
  },
  server: {
    db_file: {
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
