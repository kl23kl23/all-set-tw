import { activityDateKey, buildActivityItems } from "@taiwan-fin-hub/shared";
import { createQuery } from "@tanstack/svelte-query";
import type { ApiClient } from "@/shared/api/client";
import { exchangeRatesQuery } from "@/data/assets/queries";
import { invoiceSellerPaymentsQuery } from "@/data/invoices/seller-payments";
import { bankRangeQuery, creditCardBillsRangeQuery } from "@/data/bank/queries";
import {
  invoiceTransactionMappingsQuery,
  invoicesRangeQuery,
} from "@/data/invoices/queries";
import {
  deduplicateBankTransactions,
  matchInvoicesToTransactions,
} from "@/data/activity/matching";
import { rateMap } from "@/shared/format/financial";
import {
  periodKeyForDate,
  periodsMonthRange,
  recentPeriodKeys,
} from "./period";
import { summarizePeriods } from "./summary";

export const PERIOD_COUNT = 6;

/**
 * Loads the bank, invoice and bill data behind the statement-period pages and
 * summarizes it per period. Call from a component's script so the queries
 * share the page's lifetime; TanStack caches them across both pages.
 */
export function createPeriodData(getApi: () => ApiClient) {
  const today = activityDateKey({
    date: new Date().toISOString(),
    dateHasTime: true,
    source: "bank",
  });
  const currentPeriod = periodKeyForDate(today);
  const periodKeys = recentPeriodKeys(currentPeriod, PERIOD_COUNT);
  const range = periodsMonthRange(periodKeys);

  const bank = createQuery(() => bankRangeQuery(getApi, range));
  const invoices = createQuery(() => invoicesRangeQuery(getApi, range));
  const invoiceMappings = createQuery(() =>
    invoiceTransactionMappingsQuery(getApi, range),
  );
  const rates = createQuery(() => exchangeRatesQuery(getApi));
  const bills = createQuery(() => creditCardBillsRangeQuery(getApi, range));
  const sellerPayments = createQuery(() => invoiceSellerPaymentsQuery(getApi));

  const rateValues = $derived(rateMap(rates.data));
  const items = $derived.by(() => {
    const accounts = new Map(
      (bank.data?.accounts ?? []).map((account) => [account.id, account]),
    );
    const transactions = deduplicateBankTransactions(
      (bank.data?.transactions ?? []).map((transaction) => ({
        ...transaction,
        accountType:
          transaction.accountType ??
          accounts.get(transaction.accountId)?.accountType,
      })),
    );
    const matches = matchInvoicesToTransactions(
      transactions,
      invoices.data ?? [],
      invoiceMappings.data ?? [],
    );
    // Investment trades are not spending, so the period summary skips them.
    return buildActivityItems(
      transactions,
      invoices.data ?? [],
      [],
      accounts,
      matches,
    );
  });
  const cardSellers = $derived(new Set(sellerPayments.data?.cardSellers));
  const summaries = $derived(
    summarizePeriods(items, periodKeys, rateValues, cardSellers),
  );
  const accountOfTransaction = $derived(
    new Map(
      (bank.data?.transactions ?? []).map((transaction) => [
        transaction.id,
        transaction.accountId,
      ]),
    ),
  );

  return {
    currentPeriod,
    periodKeys,
    get pending() {
      return bank.isPending || invoices.isPending || invoiceMappings.isPending;
    },
    get failed() {
      return (
        bank.isError ||
        invoices.isError ||
        invoiceMappings.isError ||
        bills.isError
      );
    },
    get accounts() {
      return bank.data?.accounts ?? [];
    },
    get bills() {
      return bills.data ?? [];
    },
    get rates() {
      return rateValues;
    },
    get summaries() {
      return summaries;
    },
    get accountOfTransaction() {
      return accountOfTransaction;
    },
    retry() {
      void bank.refetch();
      void invoices.refetch();
      void invoiceMappings.refetch();
      void bills.refetch();
    },
  };
}
