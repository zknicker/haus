import { isIP } from 'node:net';

type Ipv4Range = readonly [base: number, prefix: number];
type Ipv6Range = readonly [base: bigint, prefix: number];

// 0.0.0.0/8 is "this network", but Linux treats 0.x.x.x as a loopback alias,
// so it is a known SSRF bypass alongside 127.0.0.0/8, not just an edge case.
const BLOCKED_IPV4_RANGES: Ipv4Range[] = [
    [requireIpv4('0.0.0.0'), 8],
    [requireIpv4('10.0.0.0'), 8],
    [requireIpv4('100.64.0.0'), 10],
    [requireIpv4('127.0.0.0'), 8],
    [requireIpv4('169.254.0.0'), 16],
    [requireIpv4('172.16.0.0'), 12],
    [requireIpv4('192.168.0.0'), 16],
];

const BLOCKED_IPV6_RANGES: Ipv6Range[] = [
    [requireIpv6('::'), 128],
    [requireIpv6('::1'), 128],
    [requireIpv6('fc00::'), 7],
    [requireIpv6('fe80::'), 10],
];

// `new URL` canonicalizes a bracketed `::ffff:a.b.c.d` literal to the hex-group
// form (`::ffff:7f00:1`), but an unnormalized string from a raw DNS record can
// still arrive dotted, and neither form is caught by the IPv6 range table above
// (`::ffff:10.0.0.1` is not in fc00::/7), so the embedded IPv4 must be checked too.
const ipv4MappedDotted = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i;
const ipv4MappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i;

export function isBlockedNetworkAddress(address: string): boolean {
    const family = isIP(address);
    if (family === 4) {
        const value = parseIpv4(address);
        return value === null || isIpv4Blocked(value);
    }
    if (family === 6) {
        const mapped = extractIpv4MappedAddress(address);
        if (mapped !== null) {
            const value = parseIpv4(mapped);
            return value === null || isIpv4Blocked(value);
        }
        return isIpv6Blocked(address);
    }
    return true;
}

function extractIpv4MappedAddress(address: string): null | string {
    const dotted = ipv4MappedDotted.exec(address);
    if (dotted) {
        return dotted[1];
    }
    const hex = ipv4MappedHex.exec(address);
    if (!hex) {
        return null;
    }
    const high = Number.parseInt(hex[1], 16);
    const low = Number.parseInt(hex[2], 16);
    return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

function isIpv4Blocked(address: number): boolean {
    return BLOCKED_IPV4_RANGES.some(([base, prefix]) => inIpv4Cidr(address, base, prefix));
}

function isIpv6Blocked(address: string): boolean {
    const value = parseIpv6(address);
    return (
        value === null ||
        BLOCKED_IPV6_RANGES.some(([base, prefix]) => inIpv6Cidr(value, base, prefix))
    );
}

function inIpv4Cidr(address: number, base: number, prefix: number): boolean {
    const mask = prefix === 0 ? 0 : (0xff_ff_ff_ff << (32 - prefix)) >>> 0;
    return (address & mask) === (base & mask);
}

function inIpv6Cidr(address: bigint, base: bigint, prefix: number): boolean {
    const allOnes = (1n << 128n) - 1n;
    const mask = prefix === 0 ? 0n : (allOnes << BigInt(128 - prefix)) & allOnes;
    return (address & mask) === (base & mask);
}

function parseIpv4(address: string): null | number {
    const octets = address.split('.');
    if (octets.length !== 4) {
        return null;
    }
    let value = 0;
    for (const octet of octets) {
        if (!/^\d{1,3}$/.test(octet)) {
            return null;
        }
        const n = Number(octet);
        if (n > 255) {
            return null;
        }
        value = value * 256 + n;
    }
    return value;
}

function parseIpv6(address: string): bigint | null {
    const groups = expandIpv6Groups(address);
    if (groups.length !== 8 || groups.some((group) => !/^[0-9a-fA-F]{1,4}$/.test(group))) {
        return null;
    }
    let value = 0n;
    for (const group of groups) {
        value = (value << 16n) | BigInt(Number.parseInt(group, 16));
    }
    return value;
}

function expandIpv6Groups(address: string): string[] {
    const parts = address.split('::');
    const splitNonEmpty = (segment: string | undefined) =>
        segment === undefined || segment === '' ? [] : segment.split(':');
    if (parts.length === 1) {
        return splitNonEmpty(parts[0]);
    }
    if (parts.length !== 2) {
        return [];
    }
    const head = splitNonEmpty(parts[0]);
    const tail = splitNonEmpty(parts[1]);
    const missing = 8 - head.length - tail.length;
    return missing < 0 ? [] : [...head, ...new Array(missing).fill('0'), ...tail];
}

function requireIpv4(address: string): number {
    const value = parseIpv4(address);
    if (value === null) {
        throw new Error(`invalid IPv4 literal: ${address}`);
    }
    return value;
}

function requireIpv6(address: string): bigint {
    const value = parseIpv6(address);
    if (value === null) {
        throw new Error(`invalid IPv6 literal: ${address}`);
    }
    return value;
}
