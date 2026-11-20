import { expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCQueryUtils } from '@trpc/react-query';
import { observable } from '@trpc/server/observable';
import { renderToStaticMarkup } from 'react-dom/server';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { ViewerFace } from './capy-account-menu.tsx';

function render(directory: unknown) {
    const queryClient = new QueryClient();
    const client = hausTrpc.createClient({
        links: [() => () => observable(() => () => undefined)],
    });
    if (directory) {
        createTRPCQueryUtils({ client, queryClient }).member.list.setData(
            { serverId: 'srv_render' },
            directory as never
        );
    }
    return renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
            <hausTrpc.Provider client={client} queryClient={queryClient}>
                <ViewerFace serverId="srv_render" />
            </hausTrpc.Provider>
        </QueryClientProvider>
    );
}

test('the account button draws nothing until the member list names you', () => {
    expect(render(null)).toBe('');
});

test('the account button wears your face once you are known', () => {
    const html = render({
        members: [{ avatarUrl: null, displayName: 'Ada Lovelace', userId: 'usr_ada' }],
        viewerRole: 'owner',
        viewerUserId: 'usr_ada',
    });
    expect(html).toContain('AL');
    expect(html).not.toContain('YO');
});
