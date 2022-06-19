import { pollUnsentEmail, type User, type OutboundEmail } from "./data";
import { info } from "./log";
import config from "./config";

const sleep = (ms) => new Promise((resolve) => setTimeout(ms, resolve));

type OutboundPostmarkEmail = {
  From: string;
  To: string;
  Subject: string;
  TextBody: string;
  HtmlBody: string;
};

const toOutboundPostmarkEmail = (e: OutboundEmail, u: User): OutboundPostmarkEmail => {
  return {
    From: e.sender,
    To: u.userEmail,
    Subject: e.subject,
    TextBody: e.body,
    HtmlBody: e.bodyHtml ?? "",
  };
};

export const createOutboxMonitor = () => {
  const start = async () => {
    info("polling for unsent outbound emails");
    const token = config.get("postmark_token");

    while (true) {
      for (const [email, user] of pollUnsentEmail() {
        info({ to: user.userEmail, from: email.sender }, "sending email");
        const req = await fetch("https://api.postmarkapp.com/email", {
        });
      }
    }
  };

  return {
    start
  };
}
