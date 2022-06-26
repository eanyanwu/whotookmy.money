import http from "http";
import { verifyMac } from "./crypto";
import { lookupUser, type User } from "./data";

/* Message Authentication Codes are used to verify that (a) a message wasn't
 * tampered with and (b) that it came from the person you expected it to (i.e.
 * it's valid) For now, I don't really need to secure my dashboard endpoint. In
 * fact, _not_ having a login screen is a feature (simplicity). But I also don't
 * want someone to be able to enumerate through dashboards by userID, or by
 * trying different user emails. Creating a MAC for the email/id and including
 * it in the dashboard link proves that it was I who generated the link*/
export const isAuthenticated = (
  req: http.IncomingMessage
): [boolean, User | undefined] => {
  let url = req.url!;
  let qsIdx = url.indexOf("?");

  if (qsIdx === -1) {
    return [false, undefined];
  }

  let qs = new URLSearchParams(url.slice(qsIdx));
  let userIdStr = qs.get("id");
  let mac = qs.get("mac");

  if (!userIdStr || !mac) {
    return [false, undefined];
  }

  let userId = Number.parseInt(userIdStr);
  if (Number.isNaN(userId)) {
    return [false, undefined];
  }

  let user: User;
  try {
    user = lookupUser({ id: userId });
  } catch (_err) {
    return [false, undefined];
  }

  if (!verifyMac(userIdStr, mac)) {
    return [false, undefined];
  }

  return [true, user];
};
