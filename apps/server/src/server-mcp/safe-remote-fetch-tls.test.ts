import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import dns from 'node:dns';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { safeFetch } from './safe-remote-fetch.ts';

// Proves the connection-pinning mechanism (not just the range check, which
// safe-remote-fetch.test.ts covers with a mocked fetch) against a real TLS
// socket under the real Bun engine: a certificate issued for a hostname is
// only accepted because `tls.serverName` carries that hostname through to
// OpenSSL's verification, even though the TCP connection target is a
// different, pinned IP. Skipped where `openssl` isn't on PATH.
const opensslAvailable = spawnSync('openssl', ['version']).status === 0;
const describeIfOpenssl = opensslAvailable ? describe : describe.skip;

describeIfOpenssl('safeFetch TLS pinning', () => {
    let dir: string;
    let key: Buffer;
    let cert: Buffer;
    let ca: Buffer;
    const originalLookup = dns.promises.lookup;

    beforeAll(async () => {
        dir = await mkdtemp(join(tmpdir(), 'haus-tls-pin-'));
        const run = (args: string[]) => {
            const result = spawnSync('openssl', args, { cwd: dir });
            if (result.status !== 0) {
                throw new Error(`openssl ${args.join(' ')} failed: ${result.stderr}`);
            }
        };
        run([
            'req',
            '-x509',
            '-newkey',
            'rsa:2048',
            '-nodes',
            '-keyout',
            'ca.key',
            '-out',
            'ca.crt',
            '-days',
            '2',
            '-subj',
            '/CN=Haus Test Root CA',
        ]);
        run([
            'req',
            '-newkey',
            'rsa:2048',
            '-nodes',
            '-keyout',
            'leaf.key',
            '-out',
            'leaf.csr',
            '-subj',
            '/CN=pinned.example.test',
        ]);
        await import('node:fs/promises').then((fs) =>
            fs.writeFile(join(dir, 'ext.cnf'), '[v3]\nsubjectAltName = DNS:pinned.example.test\n')
        );
        run([
            'x509',
            '-req',
            '-in',
            'leaf.csr',
            '-CA',
            'ca.crt',
            '-CAkey',
            'ca.key',
            '-CAcreateserial',
            '-out',
            'leaf.crt',
            '-days',
            '2',
            '-extfile',
            'ext.cnf',
            '-extensions',
            'v3',
        ]);
        [key, cert, ca] = await Promise.all([
            readFile(join(dir, 'leaf.key')),
            readFile(join(dir, 'leaf.crt')),
            readFile(join(dir, 'ca.crt')),
        ]);
    });

    afterAll(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    afterEach(() => {
        dns.promises.lookup = originalLookup;
    });

    test('connects to the resolved (pinned) IP while validating the certificate against the original hostname', async () => {
        let receivedHost = '';
        const server = Bun.serve({
            fetch(req) {
                receivedHost = req.headers.get('host') ?? '';
                return new Response('pinned-ok');
            },
            hostname: '127.0.0.1',
            port: 0,
            tls: { cert, key },
        });
        dns.promises.lookup = (() =>
            Promise.resolve([
                { address: '127.0.0.1', family: 4 },
            ])) as unknown as typeof dns.promises.lookup;

        try {
            const response = await safeFetch(
                `https://pinned.example.test:${server.port}/`,
                { tls: { ca } } as RequestInit,
                'tls pinning proof',
                { allowPrivateNetworks: true }
            );
            expect(response.status).toBe(200);
            expect(await response.text()).toBe('pinned-ok');
            expect(receivedHost).toBe(`pinned.example.test:${server.port}`);
        } finally {
            server.stop(true);
        }
    });

    test('negative control: connecting straight to the IP without the serverName override fails certificate verification', async () => {
        const server = Bun.serve({
            fetch: () => new Response('should not be reached'),
            hostname: '127.0.0.1',
            port: 0,
            tls: { cert, key },
        });
        try {
            await expect(
                fetch(`https://127.0.0.1:${server.port}/`, { tls: { ca } } as RequestInit)
            ).rejects.toThrow();
        } finally {
            server.stop(true);
        }
    });
});
