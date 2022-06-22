import type { InboundEmail } from "../core";
import { routeEmail } from "../core";
import { parseRfc2822, toUnixTimestamp } from "../datetime";
import { error } from "../log";
import type { HttpHandlerResponse } from "./http_handler";

class CouldNotParseEmail extends Error {
  constructor() {
    super("failed to parse incoming postmark emial");
  }
}

/* An email field within the JSON sent by Postmark */
type PostmarkAddress = {
  Email: string;
  Name: string;
};

/* A parsed email in JSON format, sent to us by Postmark */
type InboundPostmarkEmail = {
  FromFull: PostmarkAddress | PostmarkAddress[];
  ToFull: PostmarkAddress | PostmarkAddress[];
  Date: string;
  Subject: string;
  MessageID: string;
  TextBody: string;
  HtmlBody: string;
};

/* Type guard for InboundPostmarkEmail
 * We use this to reject any request body that looks funny
 */
function isInboundPostmarkEmail(
  p: InboundPostmarkEmail | any
): p is InboundPostmarkEmail {
  let maybePostmarkEmail = p as InboundPostmarkEmail;
  return (
    maybePostmarkEmail.Date !== undefined &&
    maybePostmarkEmail.FromFull !== undefined &&
    maybePostmarkEmail.ToFull !== undefined &&
    maybePostmarkEmail.Subject !== undefined &&
    maybePostmarkEmail.MessageID !== undefined &&
    maybePostmarkEmail.TextBody !== undefined &&
    maybePostmarkEmail.HtmlBody !== undefined
  );
}
const stripTags = (i: string): string => {
  let output: string = "";
  let inTag = false;
  let sawContent = false;

  for (const c of i) {
    if (c === "<") {
      // we are in a tag. ignore its contents
      inTag = true;
      // If we had seen some content in the previous iteration
      // append a new line
      if (sawContent) {
        output += "\n";
        sawContent = false;
      }
    } else if (c === ">" && inTag) {
      // If we are in a tag, and see ">", we are no longer in a tag. Subsequent
      // characters should be treated as content
      inTag = false;
    } else if (!inTag) {
      // If we are not in a tag, and the current character is not an angle
      // bracket, we treat whatever we see as content
      output += c;
      sawContent = true;
    } else {
      // Everything else is ignored
    }
  }

  return output;
};

/* Searches the input for opening and closing body tags and returns everything
 * in between */
const extractHtmlBody = (i: string): string | null => {
  let open = i.indexOf("<body");
  if (open !== -1) {
    let close = i.indexOf("</body>");
    if (close !== -1) {
      return i.slice(open, close + 7);
    }
  }
  return null;
};

/* Convert from InboundPostmarkEmail to InboundEmail */
const toInboundEmail = (e: InboundPostmarkEmail): InboundEmail => {
  let to: string;
  let from: string;

  if ("Email" in e["ToFull"]) {
    to = e["ToFull"]["Email"];
  } else {
    to = e["ToFull"][0]["Email"];
  }

  if ("Email" in e["FromFull"]) {
    from = e["FromFull"]["Email"];
  } else {
    from = e["FromFull"][0]["Email"];
  }

  const [date, offset] = parseRfc2822(e["Date"]);
  const timestamp = toUnixTimestamp(date);

  // Use the html body if available. If not default to text body The idea with
  // email was that there would always be a text/plain subpart, and optionally
  // a text/html, but practically many emails keep the actual content in the
  // text/html supbart and omit (or put placeholder text) in the text/plain
  // subpart
  const hasHtmlBody = e["HtmlBody"].trim() !== "";
  const hasTextBody = e["TextBody"].trim() !== "";

  let emailBody: string | undefined = undefined;

  if (hasHtmlBody) {
    const htmlBody = extractHtmlBody(e["HtmlBody"]);
    if (htmlBody) {
      emailBody = stripTags(htmlBody);
    }
  }

  if (hasTextBody && !emailBody) {
    emailBody = e["TextBody"];
  }

  if (!emailBody) {
    emailBody = undefined;
  } else {
    emailBody = emailBody
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s != "")
      .join("\n");
  }

  return {
    to: to.toLowerCase(),
    from: from.toLowerCase(),
    subject: e["Subject"],
    messageId: e["MessageID"],
    body: emailBody,
    tzOffset: offset,
    timestamp,
  };
};

type PostmarkHandlerArgs = {
  payload: Buffer;
};
/* Handler for postmark webhook requests */
export const postmark = async ({
  payload,
}: PostmarkHandlerArgs): Promise<HttpHandlerResponse> => {
  let json;
  try {
    json = JSON.parse(payload.toString());
  } catch (_) {
    // Assumption: Postmark will always send us valid JSON
    return { statusCode: 400 };
  }

  if (isInboundPostmarkEmail(json)) {
    try {
      routeEmail(toInboundEmail(json));
    } catch (e) {
      // We always want to return OK so postmark doesn't resend the email to us
      // If an error happens when handling the email, just log and move on
      error(e);
    }
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/plain" },
      data: "OK",
    };
  } else {
    // Assumption: Postmark will always send us JSON that conforms to the email schema
    return { statusCode: 400 };
  }
};
