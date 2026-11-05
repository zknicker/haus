import { describe, expect, test } from 'bun:test';
import { resolveMcpConnectionIcon } from './connection-branding.ts';
import type { McpIconResolver } from './icons.ts';

// Hosted connectors (Skool) use a placeholder `.haus.invalid` URL that never
// resolves in DNS (apps/server/src/hosted-mcp/catalog.ts) and is never meant
// to be fetched. This proves icon resolution never reaches the network guard
// for them: the bundled preset icon short-circuits before `resolveIcon` runs.
describe('resolveMcpConnectionIcon for a hosted preset', () => {
    test('returns the bundled Skool icon without calling the network icon resolver', async () => {
        const resolveIcon: McpIconResolver = () => {
            throw new Error('resolveIcon must not run for a bundled-icon preset');
        };

        const icon = await resolveMcpConnectionIcon(resolveIcon, {
            icon: null,
            preset: 'skool',
            url: 'https://hosted-mcp.haus.invalid/skool/mcp',
        });

        expect(icon).not.toBeNull();
    });
});
