import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getGrokUsage, normalizeGrokUsage } from './grok-usage.ts';

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

test('normalizes the current Grok weekly allowance and proto3 zero omission', () => {
    const snapshot = normalizeGrokUsage(
        {
            config: {
                currentPeriod: {
                    end: '2026-08-18T12:00:00Z',
                    type: 'USAGE_PERIOD_TYPE_WEEKLY',
                },
            },
        },
        new Date('2026-08-14T12:00:00Z')
    );

    expect(snapshot.windows).toEqual([
        {
            id: 'current-period',
            label: 'Weekly Limit',
            remainingPercent: 100,
            resetsAt: '2026-08-18T12:00:00.000Z',
            usedPercent: 0,
        },
    ]);
});

test('reads Grok Build billing with its current OAuth headers', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-grok-usage-'));
    roots.push(root);
    await mkdir(root, { recursive: true });
    await writeFile(
        join(root, 'auth.json'),
        JSON.stringify({
            'https://auth.x.ai::client': {
                expires_at: '2026-08-20T00:00:00Z',
                key: 'secret-token',
                user_id: 'user-1',
            },
        })
    );
    let authorization = '';
    let requestUrl = '';
    let tokenAuth = '';

    const snapshot = await getGrokUsage({
        authFile: join(root, 'auth.json'),
        fetch: async (input, init) => {
            const request = new Request(input, init);
            authorization = request.headers.get('authorization') ?? '';
            requestUrl = request.url;
            tokenAuth = request.headers.get('x-xai-token-auth') ?? '';
            return Response.json({
                config: {
                    creditUsagePercent: 37.5,
                    currentPeriod: {
                        end: '2026-08-18T12:00:00Z',
                        type: 'USAGE_PERIOD_TYPE_WEEKLY',
                    },
                },
            });
        },
        now: new Date('2026-08-14T12:00:00Z'),
        proxyUrl: 'https://proxy.example/v1',
        version: '1.0.3',
    });

    expect(requestUrl).toBe('https://proxy.example/v1/billing?format=credits');
    expect(authorization).toBe('Bearer secret-token');
    expect(tokenAuth).toBe('xai-grok-cli');
    expect(snapshot.windows[0]).toMatchObject({
        label: 'Weekly Limit',
        remainingPercent: 62.5,
        usedPercent: 37.5,
    });
});
