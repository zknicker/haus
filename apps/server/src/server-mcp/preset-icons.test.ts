import { describe, expect, test } from 'bun:test';
import { mcpIconSchema, mcpPresetIcons, mcpPresetSchema } from '@haus/api';
import type { mcpConnectionsTable } from '../postgres/schema.ts';
import { resolveMcpPresetIcons } from './presets.ts';
import { shapeMcpConnection } from './state.ts';

const resolvedIcon = { dark: null, light: 'data:image/png;base64,iVBORw0KGgo=' };

function row(
    overrides: Partial<typeof mcpConnectionsTable.$inferSelect>
): typeof mcpConnectionsTable.$inferSelect {
    return {
        accountLabel: null,
        auth: 'oauth',
        connected: false,
        createdAt: new Date(0),
        headerNames: [],
        icon: null,
        id: 'mcp_AAAAAAAAAAAAAAAA',
        name: 'MerchBase',
        preset: null,
        serverId: 'server_1',
        summary: null,
        tools: [],
        url: 'https://app.merchbase.co/mcp',
        ...overrides,
    };
}

describe('bundled preset icons', () => {
    test.each(
        mcpPresetSchema.options.filter((preset) => preset !== 'merchbase-fulfillment')
    )('%s ships a contract-valid PNG', (preset) => {
        const icon = mcpPresetIcons[preset];

        expect(mcpIconSchema.safeParse(icon).success).toBe(true);
        expect(icon?.light).toStartWith('data:image/png;base64,iVBORw0KGgo');
    });
});

describe('preset icon fallback', () => {
    test('Fulfillment uses discovered identity without a bundled override', () => {
        expect(mcpPresetIcons['merchbase-fulfillment']).toBeUndefined();
        expect(
            shapeMcpConnection(row({ preset: 'merchbase-fulfillment', icon: resolvedIcon })).icon
        ).toEqual(resolvedIcon);
        expect(shapeMcpConnection(row({ preset: 'merchbase-fulfillment' })).icon).toBeNull();
    });

    test('Recommended resolves Fulfillment through the standard resolver before sign-in', async () => {
        const urls: string[] = [];
        const catalog = await resolveMcpPresetIcons(async (input) => {
            urls.push(input.connectionUrl);
            expect(input.serverInfoIcons).toEqual([]);
            return resolvedIcon;
        });
        expect(urls).toEqual(['https://fulfillment.merchbase.co/mcp/printful']);
        expect(catalog.find((entry) => entry.preset === 'merchbase-fulfillment')?.icon).toEqual(
            resolvedIcon
        );
        const unavailable = await resolveMcpPresetIcons(async () => null);
        expect(
            unavailable.find((entry) => entry.preset === 'merchbase-fulfillment')?.icon
        ).toBeNull();
    });
    test('a preset with no resolved icon reports its bundled mark', () => {
        const shaped = shapeMcpConnection(row({ preset: 'merchbase' }));

        expect(shaped.icon).toEqual(mcpPresetIcons.merchbase ?? null);
    });

    test('the bundled mark wins over a resolved icon', () => {
        const shaped = shapeMcpConnection(row({ icon: resolvedIcon, preset: 'rankwrangler' }));

        expect(shaped.icon).toEqual(mcpPresetIcons.rankwrangler ?? null);
    });

    test('a custom connection keeps its resolved icon', () => {
        expect(shapeMcpConnection(row({ icon: resolvedIcon, preset: null })).icon).toEqual(
            resolvedIcon
        );
    });

    test('a malformed stored icon still falls back to the bundled mark', () => {
        const malformed = { dark: null, light: 'https://tracker.example/x.png' };
        const shaped = shapeMcpConnection(row({ icon: malformed, preset: 'google-calendar' }));

        expect(shaped.icon).toEqual(mcpPresetIcons['google-calendar'] ?? null);
    });

    test('a custom connection gets no bundled art', () => {
        expect(shapeMcpConnection(row({ preset: null })).icon).toBeNull();
    });
});
