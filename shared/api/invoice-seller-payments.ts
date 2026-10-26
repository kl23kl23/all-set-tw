/** `GET /api/invoice-seller-payments`：標記為「通常刷卡」的發票店家。 */
export interface InvoiceSellerPaymentsResponse {
  cardSellers: string[];
}

/** `PUT /api/invoice-seller-payments`；card 為 false 時取消標記。 */
export interface InvoiceSellerPaymentInput {
  sellerName: string;
  card: boolean;
}
