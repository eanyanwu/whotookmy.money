import config from "../config";
import { generateMac } from "../crypto";
import { dollarStringToCents } from "../currency";
import type { User } from "../data";
import { getOrCreateUser, queueEmail, savePurchase } from "../data";
import { info } from "../log";

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
  body: string;
};

class PurchaseEmailError extends Error {
  constructor() {
    super("could not parse purchase email");
  }
}

class CouldNotRouteEmail extends Error {
  constructor() {
    super("could not determine where to route email");
  }
}

class UnrecognizedBank extends Error {
  constructor(from: string) {
    super("unrecognized bank " + from);
  }
}

/* Parses a purchase alert and saves the transaction info to the database */
const handlePurchaseAlert = (user: User, email: InboundEmail) => {
  const from = email.from;

  const lines = email["body"].split("\n");

  let merchant: string;
  let amountStr: string;

  if (from === CHASE_ALERT_EMAIL) {
    // chase credit card uses "Merchant"
    let merchant_idx = lines.findIndex((x) => x === "Merchant");
    if (merchant_idx === -1) {
      // chase debit uses "Description"
      merchant_idx = lines.findIndex((x) => x === "Description");
    }
    let amount_idx = lines.findIndex((x) => x === "Amount");
    if (merchant_idx === -1 || amount_idx == -1) {
      throw new PurchaseEmailError();
    }

    merchant = lines[merchant_idx + 1];
    amountStr = lines[amount_idx + 1];
  } else if (from === SCHWAB_ALERT_EMAIL) {
    let merchant_idx = lines.findIndex((x) => x === "Amount");
    if (merchant_idx === -1) {
      throw new PurchaseEmailError();
    }

    merchant = lines[merchant_idx + 1];
    amountStr = lines[merchant_idx + 2];
  } else {
    throw new UnrecognizedBank(from);
  }

  const amount = dollarStringToCents(amountStr);

  savePurchase({ user, amount, merchant, timestamp: email.timestamp });
};

const sendWelcomeEmail = (user: User) => {
  const domain = config.get("email_domain");
  const qs = `email=${user.userEmail}&mac=${generateMac(user.userEmail)}`;
  const dashboard = `https://${domain}/dashboard?${qs}`;
  const welcome = `
  ~~~
  Here is the link to your dashboard: ${dashboard}
  ~~~`;

  queueEmail({
    sender: `info@${domain}`,
    to: user.userEmail,
    subject: "Welcome!",
    body: welcome,
  });
};

const routeEmail = (email: InboundEmail) => {
  const msgid = email.messageId;
  const from = email.from;
  const to = email.to;

  info({ msgid, from, to }, "new inbound email");

  const isPurchaseAlert = (email: InboundEmail) => {
    const subject = email.subject.toLowerCase();
    return subject.includes("transaction") || subject.includes("card");
  };

  const sentToInfo = (email: InboundEmail) => {
    return email.to.startsWith("info@");
  };

  if (sentToInfo(email)) {
    const [user, _] = getOrCreateUser({ email: email.from });
    sendWelcomeEmail(user);
  } else if (isPurchaseAlert(email)) {
    const [user, isNew] = getOrCreateUser({ email: email.from });
    if (isNew) {
      sendWelcomeEmail(user);
    }
    handlePurchaseAlert(user, email);
  } else {
    throw new CouldNotRouteEmail();
  }
};

export { routeEmail };
