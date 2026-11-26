// Access checks – Shop – status and preview (run by scripts/check-access.ts)
import type { AnyDoc, Context } from './context'

export async function checkShopStatus(t: Context): Promise<void> {
  const { payload, as, check } = t
  const { admin, createLocalReq, manager, offersRoute } = t.f

  // ---------- Shop: status in the Site settings, prints in the preview ----------
  console.log('Shop – status and preview')

  const { Site: SiteGlobal } = await import('../../src/globals/Site')
  const statusEndpoint = (SiteGlobal.endpoints as AnyDoc[]).find((endpoint) => endpoint.path === '/shop-status')
  const shopStatusAs = async (user: AnyDoc) => statusEndpoint.handler(await createLocalReq({ user }, payload)) as Promise<Response>
  const openStatus = await shopStatusAs(admin)
  const openJson = (await openStatus.json()) as AnyDoc

  check('the shop status is shown to admins', openStatus.status === 200 && openJson.open === true, openJson)
  check('the shop status is not for managers', (await shopStatusAs(manager)).status === 403)
  check(
    'the shop status never contains the secret values',
    !JSON.stringify(openJson).includes('sk_test_access_check') && !JSON.stringify(openJson).includes('whsec_access_check'),
  )

  await payload.updateGlobal({ slug: 'site', data: { shopEnabled: false }, overrideAccess: true })

  const closedJson = (await (await shopStatusAs(admin)).json()) as AnyDoc

  check(
    'a closed shop names what is missing',
    closedJson.open === false && closedJson.items.some((item: AnyDoc) => item.required && !item.ok && item.label.includes('Shop is open')),
    closedJson,
  )

  const { token: managerToken } = await payload.login({
    collection: 'users',
    data: { email: 'manager@test.local', password: 'manager-password-1' },
  })
  const offersAs = async (query: string, token?: string) =>
    (await (
      await offersRoute(
        new Request('http://localhost:3000/shop/offers?exhibition=shop-one' + query, {
          headers: token ? { Authorization: `JWT ${token}` } : {},
        }),
      )
    ).json()) as AnyDoc

  check('a closed shop shows visitors no prints', (await offersAs('')).offers.length === 0)
  check('the preview without login shows no prints either', (await offersAs('&preview')).offers.length === 0)

  const previewJson = await offersAs('&preview', managerToken)

  check(
    'the preview with login shows the prints of a closed shop',
    previewJson.preview === true && previewJson.enabled === false && previewJson.offers.length === 2,
    previewJson,
  )

  await payload.updateGlobal({ slug: 'site', data: { shopEnabled: true }, overrideAccess: true })
}
