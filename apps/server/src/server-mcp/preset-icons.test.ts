import { describe, expect, test } from 'bun:test';
import { mcpIconSchema, mcpPresetIcons, mcpPresetSchema } from '@haus/api';
import type { mcpConnectionsTable } from '../postgres/schema.ts';
import { resolveMcpConnectionIcon } from './connection-branding.ts';
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
        mcpPresetSchema.options.filter(
            (preset) =>
                preset !== 'merchbase-fulfillment' &&
                preset !== 'merchbase-atlas' &&
                preset !== 'handmade' &&
                preset !== 'tmterminal' &&
                preset !== 'cloudflare' &&
                preset !== 'linear' &&
                preset !== 'factory' &&
                preset !== 'kittl'
        )
    )('%s ships a contract-valid PNG', (preset) => {
        const icon = mcpPresetIcons[preset];

        expect(mcpIconSchema.safeParse(icon).success).toBe(true);
        expect(icon?.light).toStartWith('data:image/png;base64,iVBORw0KGgo');
    });
});

describe('preset icon fallback', () => {
    test.each([
        'cloudflare',
        'linear',
        'merchbase-atlas',
        'merchbase-fulfillment',
        'handmade',
        'tmterminal',
        'factory',
        'kittl',
    ] as const)('%s uses discovered identity without a bundled override', (preset) => {
        expect(mcpPresetIcons[preset]).toBeUndefined();
        expect(shapeMcpConnection(row({ preset, icon: resolvedIcon })).icon).toEqual(resolvedIcon);
        expect(shapeMcpConnection(row({ preset })).icon).toBeNull();
    });

    test('Recommended resolves service-owned icons through the standard resolver before sign-in', async () => {
        const urls: string[] = [];
        const catalog = await resolveMcpPresetIcons(async (input) => {
            urls.push(input.connectionUrl);
            expect(input.serverInfoIcons).toEqual([]);
            expect(input.preferPageIcon).toBe(true);
            return resolvedIcon;
        });
        expect(urls).toEqual([
            'https://mcp.cloudflare.com/mcp',
            'https://mcp.kittl.com/mcp',
            'https://handmade.merchbase.co/mcp',
            'https://atlas.merchbase.co/mcp',
            'https://fulfillment.merchbase.co/mcp/printful',
            'https://tmterminal.merchbase.co/mcp',
            'https://mcp.linear.app/mcp',
            'https://factory-agent.merchbase.co/mcp',
        ]);
        expect(catalog.find((entry) => entry.preset === 'merchbase-atlas')?.icon).toEqual(
            resolvedIcon
        );
        expect(catalog.find((entry) => entry.preset === 'handmade')?.icon).toEqual(resolvedIcon);
        expect(catalog.find((entry) => entry.preset === 'merchbase-fulfillment')?.icon).toEqual(
            resolvedIcon
        );
        const unavailable = await resolveMcpPresetIcons(async () => null);
        for (const preset of ['cloudflare', 'linear', 'tmterminal', 'factory', 'kittl'] as const) {
            expect(catalog.find((entry) => entry.preset === preset)?.icon).toEqual(resolvedIcon);
            expect(unavailable.find((entry) => entry.preset === preset)?.icon).toBeNull();
        }
        expect(unavailable.find((entry) => entry.preset === 'merchbase-atlas')?.icon).toBeNull();
        expect(
            unavailable.find((entry) => entry.preset === 'merchbase-fulfillment')?.icon
        ).toBeNull();
    });
    test('a bound built-in connection resolves its icon from the service, not its hosted URL', async () => {
        const urls: string[] = [];
        const icon = await resolveMcpConnectionIcon(
            async (input) => {
                urls.push(input.connectionUrl);
                return resolvedIcon;
            },
            { icon: null, preset: 'linear', url: 'https://hosted-mcp.haus.invalid/linear/mcp' }
        );
        expect(icon).toEqual(resolvedIcon);
        expect(urls).toEqual(['https://mcp.linear.app/mcp']);
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
