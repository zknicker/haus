import { expect, test } from 'bun:test';
import { isPublicAddress, resolveHost, vetHost } from './public-address.ts';

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
        '64:ff9b:1::1',
        'fec0::1',
        '::ffff:0:7f00:1',
        '::ffff:0:808:808',
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

test('a hostname is checked by every address it resolves to and pinned to the first', async () => {
    const answer = (addresses: readonly string[]) => () => Promise.resolve(addresses);

    expect(await vetHost('localhost', isPublicAddress, resolveHost)).toMatchObject({
        kind: 'blocked',
    });
    expect(await vetHost('[::1]', isPublicAddress, resolveHost)).toEqual({
        address: '::1',
        kind: 'blocked',
    });
    expect(
        await vetHost('haus.example', isPublicAddress, answer(['8.8.8.8', '127.0.0.1']))
    ).toEqual({ address: '127.0.0.1', kind: 'blocked' });
    expect(await vetHost('haus.example', isPublicAddress, answer(['8.8.8.8', '1.1.1.1']))).toEqual({
        address: '8.8.8.8',
        kind: 'pinned',
    });
    expect(await vetHost('8.8.8.8', isPublicAddress, answer([]))).toEqual({
        address: '8.8.8.8',
        kind: 'pinned',
    });
});
