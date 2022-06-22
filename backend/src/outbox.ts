import config from "./config";
import {
  markEmailSent,
  pollUnsentEmail,
  type OutboundEmail,
  type User,
} from "./data";
import { sendHttpRequestAsync } from "./http_request";
import { error, info } from "./log";

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
    const token = config.get("postmarkToken");

    while (true) {
      await sleep(10000);
      const maybeEmail = pollUnsentEmail();

      if (!maybeEmail) {
        continue;
      }

      const [email, user] = maybeEmail;
      info({ to: user.userEmail, from: email.sender }, "sending email");
      const json = JSON.stringify(toOutboundPostmarkEmail(email, user));
      try {
        const res = await sendHttpRequestAsync({
          method: "POST",
          url: "https://api.postmarkapp.com/email",
          headers: {
            "X-Postmark-Server-Token": token,
            "Content-Type": "application/json",
          },
          data: Buffer.from(json),
        });

        const { status, data } = res;
        if (status < 200 && status > 299) {
          // Assuming my usage of the API is correct, this could happen if
          // postmark is temporarily unavailable for example
          // Nothing much I can do beside just logging and moving on
          error("error sending email. received non-successful response:", data);
        } else {
          markEmailSent(email);
        }
      } catch (e) {
        // This would happen if there was an error actually sending the request.
        // Assuming my code is correct, this might indicate a transient error the postmark server
        // (e.g. for some reason they are closing the connection too early)
        // hopefully transient.
        // Not worth trashing the server, just log and move on
        error("network error while sending email: ", e);
      }
    }
  };

  return {
    start,
  };
};
