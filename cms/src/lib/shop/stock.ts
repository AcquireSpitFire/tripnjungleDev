// Copies still left of a print = "Copies for sale in total" (exhibition) minus the copies in
// orders that hold them: paid, shipped, payment pending, and checkouts that are still running
// ("pending" until "expiresAt"). Cancelled, expired and refunded orders free them again.
// Nothing is written into the exhibition, so an editor saving it never overwrites the stock.
import type { Payload, Where } from 'payload'

import { HOLDING_STATUSES } from '../../collections/Orders'
import type { Offer } from './catalog'

function holdingNow(): Where {
  return {
    or: [
      { status: { in: [...HOLDING_STATUSES] } },
      { and: [{ status: { equals: 'pending' } }, { expiresAt: { greater_than: new Date().toISOString() } }] },
    ],
  }
}

// Copies held per print id
export async function countTaken(payload: Payload, printIds: string[]): Promise<Map<string, number>> {
  const taken = new Map<string, number>()
  const wanted = new Set(printIds)

  if (!wanted.size) {
    return taken
  }

  const result = await payload.find({
    collection: 'orders',
    where: { and: [holdingNow(), { 'items.printId': { in: [...wanted] } }] },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { items: true },
  })

  for (const order of result.docs) {
    for (const item of order.items || []) {
      if (item.printId && wanted.has(item.printId)) {
        taken.set(item.printId, (taken.get(item.printId) ?? 0) + (item.quantity ?? 1))
      }
    }
  }

  return taken
}

// null = no limit
export function copiesLeft(offer: Pick<Offer, 'copies' | 'printId'>, taken: Map<string, number>): number | null {
  return offer.copies === null ? null : Math.max(0, offer.copies - (taken.get(offer.printId) ?? 0))
}

// Checkouts run one after another: counting the stock and creating the order that holds the
// copies must not interleave, or two buyers could get the last copy. The lock lives in this
// server process (one Railway instance, like the login rate limit in src/proxy.ts).
let queue: Promise<unknown> = Promise.resolve()

export function withStockLock<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task)

  queue = run.catch(() => undefined)

  return run
}
