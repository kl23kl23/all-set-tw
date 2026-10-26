import type { InvoiceSellerPaymentsResponse } from "@taiwan-fin-hub/shared";
import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import { z } from "zod";
import type { AppBindings } from "../../platform/env";
import { honoFactory } from "../../platform/hono";
import { validationHook } from "../../platform/validation";
import {
  listCardSellers,
  markCardSeller,
  unmarkCardSeller,
} from "./repository";

const sellerPaymentSchema = z.object({
  sellerName: z.string().trim().min(1).max(200),
  card: z.boolean(),
});

export const invoiceSellerPaymentRoutes = honoFactory.createApp();
registerInvoiceSellerPaymentRoutes(invoiceSellerPaymentRoutes);

async function cardSellersResponse(
  db: D1Database,
): Promise<InvoiceSellerPaymentsResponse> {
  return { cardSellers: await listCardSellers(db) };
}

function registerInvoiceSellerPaymentRoutes(api: Hono<AppBindings>) {
  api.get("/invoice-seller-payments", async (c) =>
    c.json(await cardSellersResponse(c.env.DB)),
  );

  api.put(
    "/invoice-seller-payments",
    zValidator(
      "json",
      sellerPaymentSchema,
      validationHook("INVALID_REQUEST", "Seller payment is invalid."),
    ),
    async (c) => {
      const { sellerName, card } = c.req.valid("json");
      if (card)
        await markCardSeller(c.env.DB, sellerName, new Date().toISOString());
      else await unmarkCardSeller(c.env.DB, sellerName);
      return c.json(await cardSellersResponse(c.env.DB));
    },
  );
}
