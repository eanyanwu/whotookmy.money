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

/* Lookup a purchase by id */
export const lookupPurchase = ({ id }: { id: number }): Purchase => {
  const c = open();

  const purchase = c
    .prepare(
      `SELECT
        purchase_id as purchaseId,
        user_id as userId,
        amount_in_cents as amountInCents,
        merchant,
        timestamp,
        created_at as createdAt
      FROM purchase
      WHERE purchase_id = :id`
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

  return conn
    .prepare(
      `INSERT INTO purchase (user_id, amount_in_cents, merchant, timestamp)
    VALUES (:id, :amount, :merchant, :timestamp)
    RETURNING
      purchase_id as purchaseId,
      user_id as userId,
      amount_in_cents as amountInCents,
      merchant,
      timestamp`
    )
    .get({ id: user.userId, amount, merchant, timestamp }) as Purchase;
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

/* Returns the user's daily spend over the period */
export type DailySpend = { day: string; spend: number };
export const dailySpend = (user: User, period: number): DailySpend[] => {
  const c = open();

  // Calculates the spend per day for the given user, The `calendar` table is a
  // recursive CTE allowing me to geneerate a timeseries starting at the user's
  // first purchase and ending today
  const spend = c
    .prepare(
      `WITH start as (
      SELECT strftime('%s', 'now', '-${period} days') as timestamp
      FROM purchase
      GROUP BY user_id
      HAVING user_id = :user_id
    ),
    daily_spend as (
      SELECT
        user_id,
        date(timestamp - 14400, 'unixepoch') as day,
        SUM(amount_in_cents) as spend
      FROM purchase
      GROUP BY user_id, day
      HAVING user_id = :user_id
    ),
    calendar as (
      SELECT date(timestamp - 14400, 'unixepoch') as day
      FROM start 
      UNION ALL
      SELECT date(day, '+1 day')
      FROM calendar
      WHERE day < date()
    )
    SELECT
      calendar.day as day,
      COALESCE(daily_spend.spend, 0) as spend
    FROM calendar
    LEFT JOIN daily_spend
    ON calendar.day = daily_spend.day`
    )
    .all({ user_id: user.userId });

  return spend as DailySpend[];
};

/* Returns the user's purchases between now and `days` ago */
export const getRecentPurchases = (user: User, days: number): Purchase[] => {
  const c = open();

  const purchases = c
    .prepare(
      `SELECT
      purchase_id as purchaseId,
      user_id as userId,
      amount_in_cents as amountInCents,
      merchant,
      timestamp - 14400 as timestamp,
      created_at
    FROM purchase
    WHERE user_id = :user_id AND timestamp > strftime('%s', 'now', '-${days} days', 'start of day')`
    )
    .all({ user_id: user.userId }) as Purchase[];

  return purchases;
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
