import { open } from "../db";

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

/* Returns the user with the given email, creates them if they don't exist */
export const getOrCreateUser = ({ email }: { email: string }): User => {
  let conn = open();

  conn
    .prepare(
      `INSERT INTO user (user_email) VALUES (:email)
        ON CONFLICT DO NOTHING`
    )
    .run({ email });

  return conn
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
};

type SavePurchaseArgs = {
  email: string;
  amount: number;
  merchant: string;
  timestamp: number;
};

/* Creates a new purchase for the user */
export const savePurchase = ({
  email,
  amount,
  merchant,
  timestamp,
}: SavePurchaseArgs): Purchase => {
  const conn = open();

  const user = getOrCreateUser({ email });

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
