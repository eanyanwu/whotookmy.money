import config from "./config";
import { pollUnsentEmail, type OutboundEmail, type User } from "./data";
import { info } from "./log";

const sleep = (ms: number) =>
  new Promise((resolve, reject) => setTimeout(resolve, ms));

type OutboundPostmarkEmail = {
  From: string;
  To: string;
  Subject: string;
  TextBody: string;
  HtmlBody: string;
};

const toOutboundPostmarkEmail = (
  e: OutboundEmail,
  u: User
): OutboundPostmarkEmail => {
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
      const [email, user] = pollUnsentEmail();
      info({ to: user.userEmail, from: email.sender }, "sending email");
    }
  };

  return {
    start,
  };
};
