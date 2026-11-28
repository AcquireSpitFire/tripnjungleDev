// The statuses of an order (src/collections/Orders.ts) and what they mean for the stock
// (src/lib/shop/stock.ts):
//   pending          checkout started, the copies are held until "expiresAt"
//   awaitingPayment  paid with a delayed method (e.g. SEPA direct debit), copies held
//   paid             paid – to be shipped
//   shipped          shipped
//   cancelled        expired, failed or cancelled – the copies are free again
//   refunded         refunded in Stripe – the copies are free again
export const ORDER_STATUS_OPTIONS = [
  { label: 'Checkout started (not paid)', value: 'pending' },
  { label: 'Payment pending (e.g. SEPA)', value: 'awaitingPayment' },
  { label: 'Paid – to ship', value: 'paid' },
  { label: 'Shipped', value: 'shipped' },
  { label: 'Cancelled / expired', value: 'cancelled' },
  { label: 'Refunded', value: 'refunded' },
] as const

export type OrderStatus = (typeof ORDER_STATUS_OPTIONS)[number]['value']

// Statuses whose copies count as taken (besides "pending" until it expires). These are also
// the orders a buyer can withdraw from (/withdrawal).
export const HOLDING_STATUSES: readonly OrderStatus[] = ['awaitingPayment', 'paid', 'shipped']
