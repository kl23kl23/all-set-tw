import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import { z } from "zod";
import type { AppBindings } from "../../platform/env";
import { honoFactory } from "../../platform/hono";
import { jsonError } from "../../platform/http";
import { validationHook } from "../../platform/validation";
import {
  getSpendingBudgets,
  InvalidBudgetError,
  setSpendingBudget,
} from "./service";

const budgetSchema = z.object({
  monthlyLimit: z.number().int().positive().nullable(),
});

export const budgetRoutes = honoFactory.createApp();
registerBudgetRoutes(budgetRoutes);

function registerBudgetRoutes(api: Hono<AppBindings>) {
  api.get("/budgets", async (c) => c.json(await getSpendingBudgets(c.env)));

  api.put(
    "/budgets/:kind{card|account}",
    zValidator(
      "json",
      budgetSchema,
      validationHook("INVALID_REQUEST", "Budget is invalid."),
    ),
    async (c) => {
      try {
        await setSpendingBudget(
          c.env.DB,
          c.req.param("kind") as "card" | "account",
          c.req.valid("json").monthlyLimit,
        );
        return c.json(await getSpendingBudgets(c.env));
      } catch (error) {
        if (error instanceof InvalidBudgetError)
          return jsonError("INVALID_REQUEST", error.message, 400);
        throw error;
      }
    },
  );
}
