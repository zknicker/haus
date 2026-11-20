import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

export type AddressPolicy = (address: string) => boolean;

export const isPublicAddress: AddressPolicy = (address) => {
    const family = isIP(address);
    if (family === 0) {
        return false;
    }
    return !nonPublic.check(address, family === 4 ? 'ipv4' : 'ipv6');
};

export async function nonPublicAddressOf(hostname: string, reachable: AddressPolicy) {
    const host = hostname.replace(/^\[|\]$/gu, '');
    const addresses =
        isIP(host) === 0
            ? (await lookup(host, { all: true, verbatim: true })).map((entry) => entry.address)
            : [host];
    return addresses.find((address) => !reachable(address)) ?? null;
}

const nonPublic = new BlockList();
for (const [network, prefix] of [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.0.2.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4],
] as const) {
    nonPublic.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
    ['::', 128],
    ['::1', 128],
    ['64:ff9b::', 96],
    ['100::', 64],
    ['2001:db8::', 32],
    ['fc00::', 7],
    ['fe80::', 10],
    ['ff00::', 8],
] as const) {
    nonPublic.addSubnet(network, prefix, 'ipv6');
}
