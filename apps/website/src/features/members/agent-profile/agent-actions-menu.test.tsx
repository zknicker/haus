import { expect, test } from 'bun:test';
import { Dropdown } from '@heroui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { hausTrpc, type ServerDetail } from '../../../lib/haus-server.tsx';
import { testAgent } from '../agent-fixtures.ts';
import { AgentActions, AgentActionsSections } from './agent-actions-menu.tsx';

/** The menu's items, rendered open: the same sections every host's menu holds. */
function renderMenu(role: ServerDetail['role'], onOpenProfile?: () => void) {
    const queryClient = new QueryClient();
    const client = hausTrpc.createClient({
        links: [httpBatchLink({ url: 'http://127.0.0.1:1/trpc' })],
    });
    return renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
            <hausTrpc.Provider client={client} queryClient={queryClient}>
                <AgentActions
                    agent={testAgent()}
                    onDeleted={() => undefined}
                    onOpenProfile={onOpenProfile}
                    server={{ ...server, role }}
                >
                    <Dropdown.Menu aria-label="Captain actions">
                        <AgentActionsSections />
                    </Dropdown.Menu>
                </AgentActions>
            </hausTrpc.Provider>
        </QueryClientProvider>
    );
}

test('the Captain panel menu leads with Profile, then the lifecycle verbs; Permissions lives in All settings', () => {
    const markup = renderMenu('owner', () => undefined);
    expect(markup).toContain('Profile');
    expect(markup.indexOf('Profile')).toBeLessThan(markup.indexOf('Stop'));
    expect(markup.indexOf('Stop')).toBeLessThan(markup.indexOf('Delete Captain'));
    expect(markup).not.toContain('Permissions');
});

test('a host without Profile shows only the lifecycle verbs', () => {
    const markup = renderMenu('owner');
    expect(markup).toContain('Stop');
    expect(markup).not.toContain('Profile');
});

const server: ServerDetail = {
    avatarGenerationAvailable: false,
    channels: [],
    displayName: 'Haus HQ',
    id: 'server_one',
    role: 'owner',
    slug: 'haus-hq',
    viewerUserId: 'user_one',
};
