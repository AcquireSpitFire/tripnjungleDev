// Every form route of the shop (POST /shop/checkout, /quote, /request, /withdrawal, …) is built
// with shopPost: the request has to come from our own pages (Origin) and carry a JSON body of at
// most 32 KB. Keeping both checks here means a new route cannot forget them.
//
//   export const POST = shopPost(async (body, request) => { … return json({ … }) })
import { errorJson, isSameOrigin, readJson } from '../http'

type ShopHandler = (body: Record<string, unknown>, request: Request) => Promise<Response>

export function shopPost(handler: ShopHandler): (request: Request) => Promise<Response> {
  return async (request) => {
    if (!isSameOrigin(request)) {
      return errorJson('Forbidden', 403)
    }

    const body = await readJson(request)

    if (!body) {
      return errorJson('Invalid request', 400)
    }

    return handler(body, request)
  }
}
