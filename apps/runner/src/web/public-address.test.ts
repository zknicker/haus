import { expect, test } from 'bun:test';
import { isPublicAddress, nonPublicAddressOf } from './public-address.ts';

test('only public addresses pass, IPv4-mapped IPv6 included', () => {
    const addresses = [
        '8.8.8.8',
        '100.128.0.1',
        '172.32.0.1',
        '2606:4700::1111',
        '::ffff:8.8.8.8',
        '10.1.2.3',
        '100.64.0.1',
        '127.0.0.1',
        '169.254.169.254',
        '172.31.255.255',
        '192.168.1.1',
        '0.0.0.0',
        '224.0.0.1',
        '255.255.255.255',
        '::1',
        '::',
        'fd00::1',
        'fe80::1',
        '::ffff:127.0.0.1',
        '::ffff:10.0.0.1',
        'example.com',
    ];

    expect(addresses.filter(isPublicAddress)).toEqual([
        '8.8.8.8',
        '100.128.0.1',
        '172.32.0.1',
        '2606:4700::1111',
        '::ffff:8.8.8.8',
    ]);
});

test('a hostname is checked by every address it resolves to', async () => {
    expect(await nonPublicAddressOf('localhost', isPublicAddress)).toMatch(
        /^(?:127\.0\.0\.1|::1)$/u
    );
    expect(await nonPublicAddressOf('[::1]', isPublicAddress)).toBe('::1');
    expect(await nonPublicAddressOf('8.8.8.8', isPublicAddress)).toBeNull();
});
