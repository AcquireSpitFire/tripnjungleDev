import type { Order } from '../../payload-types'

// The internal note of an order with one more dated line (problems with payments, e-mails …;
// only visible in the admin)
export function withNote(order: Pick<Order, 'internalNote'>, note: string): string {
  return [order.internalNote, `${new Date().toISOString()}: ${note}`].filter(Boolean).join('\n')
}
