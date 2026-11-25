// Shop settings (Site settings → Shop) in the form the shop code needs, plus the Stripe client.
// Everything that decides a price is computed on the server from these settings and the
// exhibitions; the browser only sends which print and how many.
import type { Payload } from 'payload'
import Stripe from 'stripe'

import type { Site } from '../../payload-types'
import { countryName, isCountryCode } from './countries'

export const CURRENCY = 'eur'

export type ShippingZone = {
  name: string
  price: number
  freeFrom: number | null
  countries: string[]
  deliveryTime: string
}

export type ShopSettings = {
  // Switched on in the admin AND Stripe configured AND at least one shipping zone
  enabled: boolean
  shopEmail: string
  vatMode: 'smallBusiness' | 'included'
  vatRate: number
  // "incl. 20 % VAT" or "No VAT charged: small business exemption (§ 6 Abs. 1 Z 27 UStG)"
  vatNote: string
  zones: ShippingZone[]
  shopNote: string
  site: Site
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET)
}

let stripeClient: Stripe | null = null

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY

  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not set')
  }

  stripeClient ??= new Stripe(key, { maxNetworkRetries: 2, timeout: 20_000 })

  return stripeClient
}

function formatRate(rate: number): string {
  return Number.isInteger(rate) ? String(rate) : rate.toFixed(1)
}

function smallBusinessNote(site: Site): string {
  const custom = site.smallBusinessNote?.trim()

  if (custom) {
    return custom
  }

  return site.jurisdiction === 'at'
    ? 'No VAT charged: small business exemption (§ 6 Abs. 1 Z 27 UStG)'
    : 'No VAT charged: small business exemption (§ 19 UStG)'
}

export function toShopSettings(site: Site): ShopSettings {
  const vatMode = site.vatMode === 'included' ? 'included' : 'smallBusiness'
  const vatRate = typeof site.vatRate === 'number' && site.vatRate >= 0 ? site.vatRate : 0

  const zones: ShippingZone[] = (site.shippingZones || [])
    .map((zone) => ({
      name: zone.name?.trim() || '',
      price: typeof zone.price === 'number' && zone.price >= 0 ? zone.price : 0,
      freeFrom: typeof zone.freeFrom === 'number' && zone.freeFrom > 0 ? zone.freeFrom : null,
      countries: (zone.countries || []).filter(isCountryCode),
      deliveryTime: zone.deliveryTime?.trim() || '',
    }))
    .filter((zone) => zone.name && zone.countries.length)

  return {
    enabled: Boolean(site.shopEnabled) && isStripeConfigured() && zones.length > 0,
    shopEmail: site.shopEmail?.trim() || site.operatorEmail?.trim() || '',
    vatMode,
    vatRate,
    vatNote: vatMode === 'included' ? `incl. ${formatRate(vatRate)} % VAT` : smallBusinessNote(site),
    zones,
    shopNote: site.shopNote?.trim() || '',
    site,
  }
}

export async function getShopSettings(payload: Payload): Promise<ShopSettings> {
  return toShopSettings(await payload.findGlobal({ slug: 'site', depth: 0, overrideAccess: true }))
}

// The zone of a country (first match), null if it is not shipped to
export function zoneFor(settings: ShopSettings, country: string): ShippingZone | null {
  return settings.zones.find((zone) => zone.countries.includes(country)) || null
}

// All countries with a zone, sorted by name, for the country choice in the cart
export function shippingCountries(settings: ShopSettings): { code: string; name: string }[] {
  return [...new Set(settings.zones.flatMap((zone) => zone.countries))]
    .map((code) => ({ code, name: countryName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
}

export function shippingCost(zone: ShippingZone, subtotal: number): number {
  return zone.freeFrom !== null && subtotal >= zone.freeFrom ? 0 : zone.price
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

// VAT contained in a gross amount (all prices are final prices)
export function containedVat(settings: ShopSettings, gross: number): number {
  if (settings.vatMode !== 'included' || settings.vatRate <= 0) {
    return 0
  }

  return roundMoney(gross - gross / (1 + settings.vatRate / 100))
}

export function toCents(value: number): number {
  return Math.round(value * 100)
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(value)
}
