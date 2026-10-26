import { queryOptions } from "@tanstack/svelte-query";
import type { InvoiceSellerPaymentsResponse } from "@taiwan-fin-hub/shared";
import type { ApiClient } from "@/shared/api/client";
import { queryKeys } from "@/shared/api/query-keys";

type ApiProvider = () => ApiClient;

export const invoiceSellerPaymentsQuery = (getApi: ApiProvider) =>
  queryOptions({
    queryKey: queryKeys.invoiceSellerPayments,
    queryFn: () =>
      getApi().get<InvoiceSellerPaymentsResponse>(
        "/api/invoice-seller-payments",
      ),
  });
