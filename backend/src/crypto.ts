import crypto from "crypto";
import config from "./config";

// Create a message authentication code
export const generateMac = (input: string): string => {
  const macKey = config.get("wtmmMacKey");
  const hmac = crypto.createHmac("sha256", macKey, { encoding: "base64" });
  hmac.update(input);
  return hmac.digest("base64");
};

// Verify the message has not been tampreed with
export const verifyMac = (message: string, mac: string): boolean => {
  const macKey = config.get("wtmmMacKey");
  const hmac = crypto.createHmac("sha256", macKey, { encoding: "base64" });
  hmac.update(message);
  const digest = hmac.digest("base64");

  if (mac !== digest) {
    return false;
  }

  return true;
};
