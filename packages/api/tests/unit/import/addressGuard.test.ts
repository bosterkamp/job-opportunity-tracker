// @module-tag import
import { describe, expect, it } from 'vitest';
import { isPublicAddress } from '../../../src/import/addressGuard.js';

describe('isPublicAddress', () => {
  it.each([
    ['0.0.0.0', 'this network'],
    ['10.1.2.3', 'private'],
    ['100.64.0.1', 'carrier-grade NAT'],
    ['100.127.255.255', 'carrier-grade NAT, last'],
    ['127.0.0.1', 'loopback'],
    ['127.255.255.254', 'loopback, high'],
    ['169.254.169.254', 'link-local and the metadata address'],
    ['172.16.0.1', 'private, first'],
    ['172.31.255.255', 'private, last'],
    ['192.0.0.1', 'IETF protocol assignments'],
    ['192.0.2.1', 'documentation'],
    ['192.88.99.1', '6to4 relay'],
    ['192.168.1.1', 'private'],
    ['198.18.0.1', 'benchmarking'],
    ['198.51.100.1', 'documentation'],
    ['203.0.113.1', 'documentation'],
    ['224.0.0.1', 'multicast'],
    ['240.0.0.1', 'reserved'],
    ['255.255.255.255', 'broadcast'],
    ['::', 'unspecified'],
    ['::1', 'loopback'],
    ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
    ['::ffff:10.0.0.1', 'IPv4-mapped private'],
    ['::ffff:8.8.8.8', 'IPv4-mapped (never needed for a public site)'],
    ['64:ff9b::a00:1', 'NAT64'],
    ['100::1', 'discard'],
    ['2001:db8::1', 'documentation'],
    ['2002::1', '6to4'],
    ['fc00::1', 'unique local'],
    ['fd12::1', 'unique local'],
    ['fe80::1', 'link-local'],
    ['febf::1', 'link-local, last'],
    ['ff02::1', 'multicast'],
  ])('refuses %s (%s)', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '9.255.255.255',
    '11.0.0.0',
    '100.63.255.255',
    '100.128.0.0',
    '126.255.255.255',
    '128.0.0.0',
    '169.253.255.255',
    '169.255.0.0',
    '172.15.255.255',
    '172.32.0.0',
    '192.167.255.255',
    '192.169.0.0',
    '198.17.255.255',
    '198.20.0.0',
    '223.255.255.255',
    '2606:4700::1111',
    '2a00:1450:4001::1',
    'fec0::1',
  ])('allows the public address %s', (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it.each(['', 'localhost', 'example.com', '999.1.1.1', '1.2.3', 'fe80::1%eth0x'])(
    'refuses %j, which is not an IP address',
    (address) => {
      expect(isPublicAddress(address)).toBe(false);
    },
  );
});
