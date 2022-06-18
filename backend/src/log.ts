type LogLevel = "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR";

/* General-purpose logging function */
const log = (level: LogLevel, ...logArgs: unknown[]) => {
  let rest = logArgs;
  let fields = logArgs[0];

  // aparently `typeof null === "object"`
  if (typeof fields === "object" && fields !== null) {
    // fields is an object. flatten its properties
    let fieldString: string = "";

    for (const [key, value] of Object.entries(fields)) {
      fieldString += `${key}=${value}`;
    }
    // replace it with the stringified version
    logArgs.shift();
    logArgs.unshift(fieldString);
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

const timer = (label: string) => {
  console.time(label);
};

const elapsed = (label: string) => {
  console.timeEnd(label);
};

export { debug, info, warn, error, timer, elapsed };
