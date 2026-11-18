import { expect, test } from 'bun:test';
import { readOpenRouterUsage } from './openrouter-usage.ts';

const capturedAt = new Date('2026-07-28T20:00:00.000Z');

test('OpenRouter usage is unconfigured without a Computer management key', async () => {
    const overview = await readOpenRouterUsage(capturedAt, {
        managementApiKey: '',
    });

    expect(overview.status).toBe('unconfigured');
    expect(overview.keys).toEqual([]);
    expect(overview.series).toHaveLength(30);
});

test('OpenRouter activity becomes a 30-day account usage overview', async () => {
    const overview = await readOpenRouterUsage(capturedAt, {
        fetch: async () =>
            new Response(
                JSON.stringify({
                    data: [
                        {
                            byok_usage_inference: 0.25,
                            date: '2026-07-28',
                            model_permaslug: 'openai/gpt-5.6',
                            provider_name: 'OpenAI',
                            requests: 3,
                            usage: 1.5,
                        },
                    ],
                }),
                { status: 200 }
            ),
        managementApiKey: 'test-key',
    });

    expect(overview).toMatchObject({
        days: 30,
        keys: [
            {
                id: 'openai/gpt-5.6',
                label: 'openai/gpt-5.6',
                providerName: 'OpenAI',
            },
        ],
        status: 'ready',
        totalByokUsageUsd: 0.25,
        totalRequests: 3,
        totalUsageUsd: 1.5,
    });
    expect(overview.series.at(-1)).toEqual({
        date: '2026-07-28',
        values: { 'openai/gpt-5.6': 1.75 },
    });
});
