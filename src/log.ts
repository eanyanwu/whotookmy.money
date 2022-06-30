type LogLevel = "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR";

/* General-purpose logging function */
const log = (level: LogLevel, ...logArgs: unknown[]) => {
  let rest = logArgs;
  // Support structured logging by allowing caller to pass in an object as the
  // first argument
  let fields = logArgs[0];

  // The first argument is structured data if:
  // (a) It's an object
  // (b) It's not null (typeof null == 'object')...
  // (c) It's not an error. We don't want to touch error objects, just pass them along
  if (
    typeof fields === "object" &&
    fields !== null &&
    !(fields instanceof Error)
  ) {
    // fields is an object. flatten its properties
    let fieldStrings: string[] = [];

    for (const [key, value] of Object.entries(fields)) {
      fieldStrings.push(`${key}=${value}`);
    }

    // replace it with the stringified version
    logArgs.shift();
    logArgs.unshift(fieldStrings.join(" "));
  }

  let logFunc = console.log;
  if (level == "ERROR") {
    logFunc = console.error;
  }

  let now = new Date().toISOString();
  logFunc(`[${now}]`, `${level}`, ...rest);
};

const debug = (...rest: unknown[]) => {
  log("DEBUG", ...rest);
};

const info = (...rest: unknown[]) => {
  log("INFO", ...rest);
};

const warn = (...rest: unknown[]) => {
  log("WARN", ...rest);
};

const error = (...rest: unknown[]) => {
  log("ERROR", ...rest);
};

const timer = () => {
  const start = process.hrtime.bigint();

  const done = (msg: string) => {
    const ns = process.hrtime.bigint() - start;
    debug(msg.replace(":time:", `${ns / 1000000n}`));
  };

  return { done };
};

export { debug, info, warn, error, timer };
