import { expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { getQueryKey } from '@trpc/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { WorkspaceBrowserContent } from './chat-artifact-workspace-content.tsx';

const input = { agentId: 'agent-1', includeHidden: false, path: '', serverId: 'server-1' };
const queryKey = getQueryKey(hausTrpc.agent.workspaceFiles, input, 'query');

test('workspace chrome renders before the file listing resolves', () => {
    const markup = render(new QueryClient());
    expectChrome(markup);
    expect(markup).toContain('aria-busy="true"');
    expect(markup).not.toContain('No files');
});

test('a failed listing stays inside the workspace rail', async () => {
    const queryClient = new QueryClient();
    await failListing(queryClient);
    const markup = render(queryClient);
    expectChrome(markup);
    expect(markup).toContain('Unable to browse this workspace.');
});

test('a failed refresh preserves the cached file tree', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKey, { entries: [] });
    await failListing(queryClient);
    const markup = render(queryClient);
    expectChrome(markup);
    expect(markup).toContain('aria-label="Workspace files"');
    expect(markup).not.toContain('Unable to browse this workspace.');
});

async function failListing(queryClient: QueryClient) {
    await queryClient
        .fetchQuery({
            queryKey,
            queryFn: () => Promise.reject(new Error('Computer unavailable')),
            retry: false,
        })
        .catch(() => undefined);
}

function expectChrome(markup: string) {
    expect(markup).toContain('aria-label="Workspace tools"');
    expect(markup).toContain('aria-label="Search files"');
    expect(markup).toContain('No file selected');
    expect(markup).toContain('<aside');
}

function render(queryClient: QueryClient) {
    queryClient.setDefaultOptions({ queries: { retryOnMount: false } });
    const client = hausTrpc.createClient({
        links: [httpBatchLink({ url: 'http://127.0.0.1:1/trpc' })],
    });
    return renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
            <hausTrpc.Provider client={client} queryClient={queryClient}>
                <WorkspaceBrowserContent
                    agentId={input.agentId}
                    railVariant="sidebar"
                    serverId={input.serverId}
                />
            </hausTrpc.Provider>
        </QueryClientProvider>
    );
}
