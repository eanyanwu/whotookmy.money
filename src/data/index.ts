import { DateTime, FixedOffsetZone } from "luxon";
import { open } from "../db";

export class EmailRateLimit extends Error {
  constructor() {
    super("too many emails queued for this user");
  }
}

export class NoRowsReturned extends Error {
  constructor() {
    super("query returned no rows");
  }
}

export class InvalidArgs extends Error {
  constructor(...rest: unknown[]) {
    super(`method was called with invalid arguments: ${rest}`);
  }
}

export type User = {
  userId: number;
  userEmail: string;
  tzOffset: number;
  createdAt: number;
};

export type Purchase = {
  purchaseId: number;
  userId: number;
  amountInCents: number;
  merchant: string;
  timestamp: number;
  isAmended: 0 | 1;
  createdAt: number;
};

export type OutboundEmail = {
  outboundEmailId: number;
  userId: number;
  sender: string;
  subject: string;
  body: string;
  bodyHtml?: string;
  sentAt?: number;
  createdAt: number;
};

/* Looks up a user by id */

export const lookupUser = ({ id }: { id: number }): User => {
  let c = open();

  let user = c
    .prepare(
      `SELECT
      user_id as userId,
      user_email as userEmail,
      tz_offset as tzOffset,
      created_at as createdAt
    FROM user
    WHERE user_id = :id`
    )
    .get({ id }) as User;

  if (!user) {
    throw new NoRowsReturned();
  }

  return user;
};

/* Lookup a purchase by id. Any purchase amendments are automatically applied */
export const lookupPurchase = ({ id }: { id: number }): Purchase => {
  const c = open();

  const purchase = c
    .prepare(
      `
      SELECT
        p.purchase_id as purchaseId,
        p.user_id as userId,
        p.amount_in_cents as amountInCents,
        p.merchant as merchant,
        p.timestamp as timestamp,
        p.is_amended as isAmended,
        p.created_at as createdAt
      FROM amended_purchase as p
      INNER JOIN user
      ON user.user_id = p.user_id
      WHERE p.purchase_id = :id`
    )
    .get({ id }) as Purchase;

  if (!purchase) {
    throw new NoRowsReturned();
  }

  return purchase;
};

/*
 * Returns the user with the given email, creates them if they don't exist
 * The second part of the tuple indicates if the user was actually created or not
 * */
export const getOrCreateUser = ({
  email,
}: {
  email: string;
}): [User, boolean] => {
  let conn = open();

  const info = conn
    .prepare(
      `INSERT INTO user (user_email) VALUES (:email)
        ON CONFLICT DO NOTHING`
    )
    .run({ email });

  const user = conn
    .prepare(
      `SELECT
            user_id as userId,
            user_email as userEmail,
            tz_offset as tzOffset,
            created_at as createdAt
        FROM user
        WHERE user_email = :email`
    )
    .get({ email }) as User;

  return [user, info.changes > 0];
};

/* Set the user's timezone offset */
type SetTzOffsetArgs = {
  userId: number;
  tzOffset: number;
};

export const setTzOffset = ({ userId, tzOffset }: SetTzOffsetArgs) => {
  let conn = open();

  conn
    .prepare(
      `UPDATE user
    SET tz_offset = :offset 
    WHERE user_id = :user_id`
    )
    .run({ user_id: userId, offset: tzOffset });
};

type SavePurchaseArgs = {
  user: User;
  amount: number;
  merchant: string;
  timestamp: number;
};

/* Creates a new purchase for the user */
export const savePurchase = ({
  user,
  amount,
  merchant,
  timestamp,
}: SavePurchaseArgs): Purchase => {
  const conn = open();

  const res = conn
    .prepare(
      `
      INSERT INTO purchase (user_id, amount_in_cents, merchant, timestamp)
      VALUES (:id, :amount, :merchant, :timestamp)`
    )
    .run({ id: user.userId, amount, merchant, timestamp });

  // TODO: The row id might overflow javascripts number.
  // I need to eventually support the ids being of type BigInt
  return lookupPurchase({ id: res.lastInsertRowid as number });
};

type QueueEmailArgs = {
  sender: string;
  to: string;
  subject: string;
  body: string;
  body_html?: string;
};

/** Queue an email to be sent
 * This method will fail if the user already has unsent email or if we have
 * sent them an email in the past 5 minutes
 */
export const queueEmail = ({
  sender,
  to,
  subject,
  body,
  body_html,
}: QueueEmailArgs): OutboundEmail => {
  const c = open();

  const [user, _] = getOrCreateUser({ email: to });

  const count_unsent = c
    .prepare(
      `SELECT count(*) as count
    FROM outbound_email
    WHERE user_id = ? AND (
      sent_at IS NULL
      OR strftime('%s') - sent_at < 300
    )`
    )
    .get(user.userId).count;

  if (count_unsent > 0) {
    throw new EmailRateLimit();
  }

  return c
    .prepare(
      `INSERT INTO outbound_email (user_id, sender, subject, body, body_html)
    VALUES (:id, :sender, :subject, :body, :body_html)
    RETURNING
      outbound_email_id as outboundEmailId,
      user_id as userId,
      sender as sender,
      subject as subject,
      body as body,
      body_html as bodyHtml,
      sent_at as sentAt,
      created_at as createdAt
    `
    )
    .get({
      id: user.userId,
      sender,
      subject,
      body,
      body_html,
    }) as OutboundEmail;
};

/* Returns the next available unsent email */
export const pollUnsentEmail = (): [OutboundEmail, User] | undefined => {
  const c = open();
  const email = c
    .prepare(
      `SELECT
      outbound_email_id as outboundEmailId,
      user_id as userId,
      sender as sender,
      subject as subject,
      body as body,
      body_html as bodyHtml,
      sent_at as sentAt,
      created_at as createdAt
    FROM outbound_email
    WHERE sent_at is NULL
    LIMIT 1`
    )
    .get();

  if (!email) {
    return undefined;
  }

  const user = lookupUser({ id: email.userId });

  return [email, user];
};

/* Marks and email as sent */
export const markEmailSent = (e: OutboundEmail) => {
  const c = open();

  c.prepare(
    `UPDATE outbound_email SET sent_at = strftime('%s')
    WHERE outbound_email_id = ?`
  ).run(e.outboundEmailId);
};

type CreateRangeIterArgs = { start: number; end: number; step: number };
/* Create a simple range iterator for a sequence from `start`(inclusive) to `end` (exclusive)
 * spaced `steps` apart. */
export function* makeRangeIterator({
  start,
  end,
  step,
}: CreateRangeIterArgs): IterableIterator<number> {
  // The following setups are invalid
  // Step === 0
  // Start is greater than end, but the step is positive
  // Start is less than end, but the step is negative
  if (step === 0 || (start > end && step > 0) || (start < end && step < 0)) {
    throw new InvalidArgs(start, end, step);
  }

  let iterationCount = 0;

  // the comparison depends on if start > end;
  for (let i = start; start < end ? i < end : i > end; i += step) {
    iterationCount++;
    yield i;
  }

  return iterationCount;
}

/* Returns the user's purchases between now and `days` ago */
export const getRecentPurchases = (user: User, days: number): Purchase[] => {
  const c = open();

  const purchases = c
    .prepare(
      `SELECT
        p.purchase_id as purchaseId,
        p.user_id as userId,
        p.amount_in_cents as amountInCents,
        p.merchant,
        p.timestamp as timestamp,
        p.is_amended as isAmended,
        p.created_at as createdAt
      FROM amended_purchase as p
      INNER JOIN user
      ON user.user_id = p.user_id
      WHERE p.user_id = :user_id AND timestamp > strftime('%s', 'now', '-${days} days', 'start of day')
      ORDER BY p.timestamp`
    )
    .all({ user_id: user.userId }) as Purchase[];

  return purchases;
};

/* Returns the user's daily spend over the period.
 * Period is in days
 * The user's timezone offset is taken into consideration */
export type DailySpend = {
  date: DateTime;
  spend: number;
  purchases: Purchase[];
};
export const dailySpend = (user: User, period: number): DailySpend[] => {
  // TODO: validate period
  const zone = FixedOffsetZone.instance(user.tzOffset / 60);

  // `now` needs to be zone-aware to get the correct unix timestamp corresponding
  // to the start of the day, in the user's zone.
  const now = DateTime.utc().setZone(zone);
  const periodStart = now.plus({ days: -1 * period }).startOf("day");

  const iterator = makeRangeIterator({
    start: periodStart.toUnixInteger(),
    end: now.toUnixInteger(),
    step: 24 * 60 * 60,
  });

  const timeseries: DailySpend[] = [...iterator].map((t) => ({
    date: DateTime.fromSeconds(t, { zone }),
    spend: 0,
    purchases: [],
  }));

  const purchases = getRecentPurchases(user, period);

  if (purchases.length === 0) {
    return timeseries;
  }

  let tsIdx = 0;
  let purchaseIdx = 0;

  while (tsIdx < timeseries.length) {
    const start = timeseries[tsIdx].date;
    const end = start.plus({ day: 1 });
    const purchase = purchases[purchaseIdx];

    if (!purchase) {
      break;
    } else {
      // Note that the timestamp does not need to be modified to "factor" in the zone
      // "Now" in unix timestamp is the same all over the world
      // What's different is what time the unix timestamp corrsponds to.
      const purchaseTimestamp = purchase.timestamp;
      if (
        purchaseTimestamp >= start.toUnixInteger() &&
        purchaseTimestamp < end.toUnixInteger()
      ) {
        purchaseIdx += 1;
        timeseries[tsIdx].purchases.push(purchase);
        timeseries[tsIdx].spend += purchase.amountInCents;
      } else {
        tsIdx += 1;
      }
    }
  }

  return timeseries;
};

type AmendPurchaseArgs = {
  purchaseId: number;
  newAmountInCents: number;
  newMerchant: string;
};
export const amendPurchase = (amended: AmendPurchaseArgs) => {
  const c = open();

  // make sure the purchase exists.
  lookupPurchase({ id: amended.purchaseId });

  // create a purchase amendment, or update an existing one
  c.prepare(
    `INSERT INTO purchase_amendment (purchase_id, new_amount_in_cents, new_merchant)
    VALUES (:purchaseId, :newAmountInCents, :newMerchant)
    ON CONFLICT (purchase_id)
    DO UPDATE SET
    new_amount_in_cents = excluded.new_amount_in_cents,
    new_merchant = excluded.new_merchant`
  ).run(amended);
};

export const undoPurchaseAmendment = ({ id: purchaseId }: { id: number }) => {
  const c = open();
  // make sure the purchase exists
  lookupPurchase({ id: purchaseId });

  // delete the purchase amendment
  c.prepare(
    `
    DELETE FROM purchase_amendment
    WHERE purchase_id = ?`
  ).run(purchaseId);
};
