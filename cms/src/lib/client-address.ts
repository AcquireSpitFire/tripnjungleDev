// The address of a visitor, as used for the rate limits (src/proxy.ts).
//
// Railway's proxy appends the real client address as the LAST entry of X-Forwarded-For;
// earlier entries can be set freely by the client and are never trusted.
//
// IPv6: one connection usually gets a whole /64 network (2^64 addresses). IPv6 addresses are
// therefore grouped by their first four blocks – otherwise every address of that network would
// get a limit of its own.

export function clientAddress(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  const last = forwarded?.split(',').pop()?.trim()

  return addressGroup(last || headers.get('x-real-ip')?.trim() || 'local')
}

// "203.0.113.7" stays as it is, "2001:db8:1:2:3:4:5:6" becomes "2001:db8:1:2::/64"
export function addressGroup(address: string): string {
  // Without brackets, port and zone ("[2001:db8::1]:443", "fe80::1%eth0")
  const plain = address
    .replace(/^\[([^\]]*)\](:\d+)?$/, '$1')
    .split('%')[0]
    .toLowerCase()
  const mappedIPv4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(plain)

  if (mappedIPv4) {
    return mappedIPv4[1]
  }

  if (!plain.includes(':')) {
    return plain
  }

  const [head, tail] = plain.split('::')
  const headBlocks = head ? head.split(':') : []
  const tailBlocks = tail ? tail.split(':') : []
  const blocks =
    tail === undefined
      ? headBlocks
      : [...headBlocks, ...Array(Math.max(0, 8 - headBlocks.length - tailBlocks.length)).fill('0'), ...tailBlocks]

  return (
    blocks
      .slice(0, 4)
      .map((block) => block.replace(/^0+(?=.)/, ''))
      .join(':') + '::/64'
  )
}
