// Shop settings (Site settings → Shop) in the form the shop code needs, plus the Stripe client.
// Everything that decides a price is computed on the server from these settings and the
// exhibitions; the browser only sends which print and how many.
import type { Payload } from 'payload'
import Stripe from 'stripe'

import type { Site } from '../../payload-types'
import { operatorAddressLines } from '../text'
import { countryName, isCountryCode, isEuCountry } from './countries'

export const CURRENCY = 'eur'

export type ShippingZone = {
  name: string
  price: number
  freeFrom: number | null
  countries: string[]
  deliveryTime: string
}

export type ShopSettings = {
  // Switched on in the admin AND Stripe AND e-mail configured AND at least one shipping zone
  enabled: boolean
  shopEmail: string
  vatMode: 'smallBusiness' | 'included'
  vatRate: number
  // "incl. 20 % VAT" or "No VAT charged: small business exemption (§ 6 Abs. 1 Z 27 UStG)"
  vatNote: string
  zones: ShippingZone[]
  shopNote: string
  // Product safety (GPSR): manufacturer with postal and e-mail address, optional safety information
  manufacturer: string
  safetyInformation: string
  site: Site
}

function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET)
}

// Without e-mail there is no order confirmation on a durable medium and no acknowledgement of a
// withdrawal: the shop does not open
function isMailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST)
}

// The manufacturer for the product safety details: as entered, otherwise the operator of the
// legal notice (prints sold under the operator's name)
function manufacturerOf(site: Site): string {
  const custom = site.manufacturer?.trim()

  if (custom) {
    return custom
  }

  return [...operatorAddressLines(site), site.operatorEmail?.trim() || '']
    .filter(Boolean)
    .join('\n')
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
    enabled:
      Boolean(site.shopEnabled) && isStripeConfigured() && isMailConfigured() && zones.length > 0,
    shopEmail: site.shopEmail?.trim() || site.operatorEmail?.trim() || '',
    vatMode,
    vatRate,
    vatNote:
      vatMode === 'included' ? `incl. ${formatRate(vatRate)} % VAT` : smallBusinessNote(site),
    zones,
    shopNote: site.shopNote?.trim() || '',
    manufacturer: manufacturerOf(site),
    safetyInformation: site.safetyInformation?.trim() || '',
    site,
  }
}

export async function getShopSettings(payload: Payload): Promise<ShopSettings> {
  return toShopSettings(await payload.findGlobal({ slug: 'site', depth: 0, overrideAccess: true }))
}

// AT or DE, from the country of the legal notice
function homeCountry(site: Site): string {
  return site.jurisdiction === 'at' ? 'AT' : 'DE'
}

// Checklist for Site settings → Shop (src/components/ShopStatus.tsx): what the shop still needs.
// "required" items keep the shop closed; "recommended" items only warn.
export type ShopStatusItem = { label: string; ok: boolean; required: boolean; hint: string }

export function shopStatus(site: Site): { open: boolean; items: ShopStatusItem[] } {
  const settings = toShopSettings(site)
  const legalNotice = [
    site.operatorName,
    site.operatorStreet,
    site.operatorCity,
    site.operatorCountry,
    site.operatorEmail,
  ]

  const items: ShopStatusItem[] = [
    {
      label: '“Shop is open” is ticked',
      ok: Boolean(site.shopEnabled),
      required: true,
      hint: 'Tick it below and save.',
    },
    {
      label: 'Stripe secret key (STRIPE_SECRET_KEY)',
      ok: Boolean(process.env.STRIPE_SECRET_KEY),
      required: true,
      hint: 'Server variable (Railway → Variables, locally cms/.env), then restart. See README → Shop.',
    },
    {
      label: 'Stripe webhook secret (STRIPE_WEBHOOK_SECRET)',
      ok: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      required: true,
      hint: 'From Stripe → Developers → Webhooks (locally: “stripe listen”), then restart.',
    },
    {
      label: 'At least one shipping zone with countries',
      ok: settings.zones.length > 0,
      required: true,
      hint: 'Add a zone below: name, countries, cost, delivery time.',
    },
    {
      label: 'E-mail sending (SMTP_HOST)',
      ok: isMailConfigured(),
      required: true,
      hint: 'Buyers must get the order confirmation with terms and withdrawal instructions by e-mail (durable medium). Server variables SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM – until you have your own address, an existing mailbox with an app password works.',
    },
    {
      label: 'Legal notice complete (name, address, e-mail)',
      ok: legalNotice.every((value) => Boolean(value?.trim())),
      required: false,
      hint: 'Tab “Legal notice”. Needed for the cart, the terms and the e-mails.',
    },
    {
      label: 'E-mail for new orders',
      ok: Boolean(settings.shopEmail),
      required: false,
      hint: 'Field below, or the e-mail of the legal notice.',
    },
    {
      label: 'Manufacturer with postal and e-mail address (product safety)',
      ok: settings.manufacturer.split('\n').length >= 3 && settings.manufacturer.includes('@'),
      required: false,
      hint: 'Collapsible “Product safety (GPSR)” below, or a complete legal notice. Shown with every print (Regulation (EU) 2023/988).',
    },
    {
      label: 'Business purpose names the sale of prints (legal notice, Austria)',
      ok:
        site.jurisdiction !== 'at' ||
        !site.businessPurpose?.trim() ||
        /print|sale|verkauf|druck/i.test(site.businessPurpose),
      required: false,
      hint: 'Tab “Legal notice” → Business purpose, e.g. “Online gallery of photo and video exhibitions and sale of photo prints” (empty = this text).',
    },
    {
      label: 'Shipping only within the EU',
      ok: !settings.zones.some((zone) => zone.countries.some((code) => !isEuCountry(code))),
      required: false,
      hint: 'Buyers outside the EU are told automatically that import duties and taxes may apply. Add a customs declaration to the parcel; with VAT, export deliveries are usually free of VAT – ask your tax adviser.',
    },
    {
      label: 'VAT for buyers in other EU countries',
      ok:
        settings.vatMode !== 'included' ||
        !settings.zones.some((zone) =>
          zone.countries.some((code) => isEuCountry(code) && code !== homeCountry(site)),
        ),
      required: false,
      hint: 'Once sales to private buyers in other EU countries exceed €10,000 a year, their VAT rate applies (One-Stop-Shop, OSS). Keep an eye on the total.',
    },
  ]

  return { open: settings.enabled, items }
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
