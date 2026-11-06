import { describe, expect, test } from 'bun:test';
import { isBlockedNetworkAddress } from './network-guard.ts';

describe('blocked ranges', () => {
    test.each([
        ['0.0.0.0/8 unspecified', '0.0.0.0'],
        ['0.0.0.0/8 non-zero host', '0.1.2.3'],
        ['10.0.0.0/8', '10.1.2.3'],
        ['100.64.0.0/10 CGNAT', '100.64.1.1'],
        ['127.0.0.0/8 loopback', '127.0.0.1'],
        ['169.254.0.0/16 cloud metadata', '169.254.169.254'],
        ['172.16.0.0/12', '172.31.255.255'],
        ['192.168.0.0/16', '192.168.1.1'],
        ['::/128 unspecified', '::'],
        ['::1/128 loopback', '::1'],
        ['fc00::/7 unique-local', 'fd12:3456::1'],
        ['fe80::/10 link-local', 'fe80::1'],
        ['IPv4-mapped IPv6, dotted form', '::ffff:127.0.0.1'],
        ['IPv4-mapped IPv6, canonical hex form', '::ffff:7f00:1'],
        ['IPv4-mapped IPv6 of a private address not in fc00::/7', '::ffff:10.0.0.1'],
    ])('blocks %s (%s)', (_label, address) => {
        expect(isBlockedNetworkAddress(address)).toBe(true);
    });
});

describe('public addresses', () => {
    test.each(['8.8.8.8', '2606:4700:4700::1111'])('allows %s', (address) => {
        expect(isBlockedNetworkAddress(address)).toBe(false);
    });
});

describe('unclassifiable input', () => {
    test.each(['not-an-ip', 'example.com', ''])('fails closed for %p', (address) => {
        expect(isBlockedNetworkAddress(address)).toBe(true);
    });
});
