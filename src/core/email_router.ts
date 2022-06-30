import config from "../config";
import { generateMac } from "../crypto";
import * as curr from "../currency";
import type { User } from "../data";
import {
  getOrCreateUser,
  queueEmail,
  savePurchase,
  setTzOffset,
} from "../data";
import { sendHttpRequestAsync } from "../http_request";
import * as log from "../log";

/* Known emails */
export const SCHWAB_ALERT_EMAIL: string = "donotreply-comm@schwab.com";
export const CHASE_ALERT_EMAIL: string = "no.reply.alerts@chase.com";

/* An email we received */
// Note: The core tier of the application only operates on InboundEmail so that switching to alternate
// ways of receiving email is easy (i've already switched 2/3 times)
export type InboundEmail = {
  to: string;
  from: string;
  timestamp: number;
  tzOffset: number;
  subject: string;
  messageId: string;
  body?: string;
};

export class InboundEmailError extends Error {
  constructor() {
    super("could not parse inbound email");
  }
}

export class CouldNotRouteEmail extends Error {
  constructor() {
    super("could not determine where to route email");
  }
}

class UnrecognizedBank extends Error {
  constructor(from: string) {
    super("unrecognized bank " + from);
  }
}

const handleGmailForwardingConfirmation = async (email: InboundEmail) => {
  if (!email.body) {
    throw new InboundEmailError();
  }

  const lines = email.body.split("\n");

  const confirmationCodeLine =
    lines.find((s) => s.startsWith("Confirmation code:")) || "";
  const confirmationCode = confirmationCodeLine.split(" ").pop();

  const confirmationURL = lines.find((s) => s.startsWith("http"));

  // The user's email is the very first thing on the first line. If we have
  // reached this point, it's safe to assume that there is at least one line
  const userEmail = lines[0].split(" ")[0];

  if (!confirmationCode || !confirmationURL || !userEmail) {
    throw new InboundEmailError();
  }

  // Making a post request to the URL with "Host: mail.google.com" confirms it
  log.info({ email: userEmail }, "confirming gmail forwarding request");
  await sendHttpRequestAsync({
    url: confirmationURL,
    method: "POST",
    headers: {
      Host: "mail.google.com",
    },
  });

  const domain = config.get("emailDomain");

  // Send the confirmation code to the user as well
  queueEmail({
    sender: `alerts@${domain}`,
    to: userEmail,
    subject: "Gmail forwarding confirmation code",
    body: confirmationCode,
  });

  // User is very likely going to be using the service.
  // Create them
  getOrCreateUser({ email: userEmail });
};

/* Parses a purchase alert and saves the transaction info to the database */
const handlePurchaseAlert = (user: User, email: InboundEmail) => {
  const from = email.from;

  if (!email.body) {
    throw new InboundEmailError();
  }

  const lines = email.body.split("\n");

  let merchant: string;
  let amountStr: string;

  if (from === CHASE_ALERT_EMAIL) {
    // chase credit card uses "Merchant"
    let merchantIdx = lines.findIndex((x) => x === "Merchant");
    if (merchantIdx === -1) {
      // chase debit uses "Description"
      merchantIdx = lines.findIndex((x) => x === "Description");
    }
    let amountIdx = lines.findIndex((x) => x === "Amount");
    if (merchantIdx === -1 || amountIdx == -1) {
      throw new InboundEmailError();
    }

    merchant = lines[merchantIdx + 1];
    amountStr = lines[amountIdx + 1];
  } else if (from === SCHWAB_ALERT_EMAIL) {
    let merchantIdx = lines.findIndex((x) => x === "Amount");
    if (merchantIdx === -1) {
      throw new InboundEmailError();
    }

    merchant = lines[merchantIdx + 1];
    amountStr = lines[merchantIdx + 2];
  } else {
    throw new UnrecognizedBank(from);
  }

  const amount = curr.toCents(amountStr);

  savePurchase({ user, amount, merchant, timestamp: email.timestamp });
};

const sendWelcomeEmail = (user: User) => {
  const domain = config.get("emailDomain");
  const qs = `id=${user.userId}&mac=${encodeURIComponent(
    generateMac(user.userId.toString())
  )}`;
  const dashboard = `https://${domain}/login?${qs}`;
  const welcome = `

  ~~~
  Here is the link to your dashboard:
  ${dashboard}
  ~~~`;

  queueEmail({
    sender: `info@${domain}`,
    to: user.userEmail,
    subject: "Welcome!",
    body: welcome,
  });
};

export const routeEmail = async (email: InboundEmail) => {
  const msgid = email.messageId;
  const from = email.from;
  const to = email.to;

  log.info({ msgid, from, to }, "new inbound email");

  const isPurchaseAlert = (email: InboundEmail) => {
    const subject = email.subject.toLowerCase();
    return subject.includes("transaction") || subject.includes("card");
  };

  const sentToInfo = (email: InboundEmail) => {
    const domain = config.get("emailDomain");
    return email.to === `info@${domain}`;
  };

  const gmailForwardingConfirmation = (email: InboundEmail) => {
    return email.from === "forwarding-noreply@google.com";
  };

  if (gmailForwardingConfirmation(email)) {
    await handleGmailForwardingConfirmation(email);
  } else if (sentToInfo(email)) {
    const [user] = getOrCreateUser({ email: email.from });
    sendWelcomeEmail(user);
  } else if (isPurchaseAlert(email)) {
    // Purchase alerts are forwarded to us from the user.
    // So in the email, `From` is their bank and `To` is the user
    const [user, isNew] = getOrCreateUser({ email: email.to });
    if (isNew) {
      sendWelcomeEmail(user);
    }

    handlePurchaseAlert(user, email);

    user.tzOffset = email.tzOffset;
    setTzOffset(user);
  } else {
    throw new CouldNotRouteEmail();
  }
};
