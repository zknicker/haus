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
    [requireIpv4('198.18.0.0'), 15],
    [requireIpv4('224.0.0.0'), 4],
    // /4 numerically covers 255.255.255.255 (limited broadcast) too.
    [requireIpv4('240.0.0.0'), 4],
];

const BLOCKED_IPV6_RANGES: Ipv6Range[] = [
    [requireIpv6('::'), 128],
    [requireIpv6('::1'), 128],
    [requireIpv6('fc00::'), 7],
    [requireIpv6('fe80::'), 10],
    [requireIpv6('ff00::'), 8],
];

// The last two hex groups of ::ffff:, 64:ff9b::, and ::/96 all carry an
// embedded IPv4 the same way; 6to4 (2002::/16) is the odd one out, packing it
// into groups[1]/groups[2] instead of the trailing pair.
const EMBEDDED_IPV4_PREFIXES = [
    '0000:0000:0000:0000:0000:ffff',
    '0064:ff9b:0000:0000:0000:0000',
    '0000:0000:0000:0000:0000:0000',
];

export function isBlockedNetworkAddress(address: string): boolean {
    const family = isIP(address);
    if (family === 4) {
        const value = parseIpv4(address);
        return value === null || isIpv4Blocked(value);
    }
    if (family === 6) {
        const groups = expandIpv6Groups(address);
        const embedded = extractEmbeddedIpv4(groups);
        if (embedded !== null) {
            const value = parseIpv4(embedded);
            return value === null || isIpv4Blocked(value);
        }
        const value = groupsToValue(groups);
        return value === null || isIpv6Blocked(value);
    }
    return true;
}

function extractEmbeddedIpv4(groups: string[]): null | string {
    if (groups.length !== 8) {
        return null;
    }
    const normalized = groups.map((group) => group.padStart(4, '0').toLowerCase());
    if (normalized[0] === '2002') {
        return decodeHexPairToIpv4(normalized[1], normalized[2]);
    }
    if (EMBEDDED_IPV4_PREFIXES.includes(normalized.slice(0, 6).join(':'))) {
        return decodeHexPairToIpv4(normalized[6], normalized[7]);
    }
    return null;
}

function decodeHexPairToIpv4(high: string, low: string): string {
    const h = Number.parseInt(high, 16);
    const l = Number.parseInt(low, 16);
    return `${h >> 8}.${h & 0xff}.${l >> 8}.${l & 0xff}`;
}

function isIpv4Blocked(address: number): boolean {
    return BLOCKED_IPV4_RANGES.some(([base, prefix]) => inIpv4Cidr(address, base, prefix));
}

function isIpv6Blocked(address: bigint): boolean {
    return BLOCKED_IPV6_RANGES.some(([base, prefix]) => inIpv6Cidr(address, base, prefix));
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
    return groupsToValue(expandIpv6Groups(address));
}

function groupsToValue(groups: string[]): bigint | null {
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
    const rewritten = rewriteDottedIpv4Tail(address);
    if (rewritten === null) {
        return [];
    }
    const parts = rewritten.split('::');
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

// Rewrites a trailing dotted-decimal IPv4 (mixed notation, e.g.
// `::ffff:127.0.0.1` or `64:ff9b::10.0.0.1`) into two hex groups up front, so
// the rest of expansion always deals in pure hex groups.
function rewriteDottedIpv4Tail(address: string): string | null {
    const lastColon = address.lastIndexOf(':');
    const tail = address.slice(lastColon + 1);
    if (!tail.includes('.')) {
        return address;
    }
    const value = parseIpv4(tail);
    if (value === null) {
        return null;
    }
    const high = (value >>> 16) & 0xff_ff;
    const low = value & 0xff_ff;
    return `${address.slice(0, lastColon + 1)}${high.toString(16)}:${low.toString(16)}`;
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
