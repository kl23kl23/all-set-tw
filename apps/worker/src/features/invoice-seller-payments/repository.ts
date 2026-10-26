import { asc, eq } from "drizzle-orm";
import { createDrizzle, invoiceSellerPayments } from "../../db";

export async function listCardSellers(db: D1Database) {
  const rows = await createDrizzle(db)
    .select({ sellerName: invoiceSellerPayments.sellerName })
    .from(invoiceSellerPayments)
    .where(eq(invoiceSellerPayments.method, "card"))
    .orderBy(asc(invoiceSellerPayments.sellerName))
    .all();
  return rows.map((row) => row.sellerName);
}

export async function markCardSeller(
  db: D1Database,
  sellerName: string,
  now: string,
) {
  await createDrizzle(db)
    .insert(invoiceSellerPayments)
    .values({ sellerName, method: "card", updatedAt: now })
    .onConflictDoUpdate({
      target: invoiceSellerPayments.sellerName,
      set: { method: "card", updatedAt: now },
    })
    .run();
}

export async function unmarkCardSeller(db: D1Database, sellerName: string) {
  await createDrizzle(db)
    .delete(invoiceSellerPayments)
    .where(eq(invoiceSellerPayments.sellerName, sellerName))
    .run();
}
