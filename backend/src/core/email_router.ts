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

const routeEmail = (email: InboundEmail) => {
  console.log(email);
};

export { routeEmail };
