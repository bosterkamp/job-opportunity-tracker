import { BlockList, isIP } from 'node:net';

// Addresses that aren't on the public internet. Fetching a pasted link must never reach them:
// in Lambda, the runtime API listens on loopback (research.md §4).
// Separate lists, because BlockList also checks IPv4 addresses against IPv6 rules (as
// IPv4-mapped addresses), so the mapped range below would otherwise refuse every IPv4 address.
const NOT_PUBLIC_V4 = new BlockList();
const NOT_PUBLIC_V6 = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, including the cloud metadata address
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relay
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, and broadcast
] as const) {
  NOT_PUBLIC_V4.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  // IPv4 inside IPv6 (mapped and NAT64) could reach any IPv4 address, and public sites never
  // resolve to them, so they're all refused.
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['100::', 64], // discard
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
] as const) {
  NOT_PUBLIC_V6.addSubnet(network, prefix, 'ipv6');
}

// Whether a resolved address is on the public internet. Anything that isn't a valid IP
// address is refused.
export function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 0) {
    return false;
  }
  return version === 4
    ? !NOT_PUBLIC_V4.check(address, 'ipv4')
    : !NOT_PUBLIC_V6.check(address, 'ipv6');
}
