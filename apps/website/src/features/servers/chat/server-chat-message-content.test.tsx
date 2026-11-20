import { expect, test } from 'bun:test';
import type { DriveCitation } from '@haus/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { hausTrpc } from '../../../lib/haus-server.tsx';
import { withLocalTimelineMessageMetadata } from '../../chats/local-timeline-message.ts';
import { humanDirectory } from '../human-identity.ts';
import { ServerChatMessageContent } from './server-chat-message-content.tsx';

test('a cited Drive file opens on the Server slug the transcript passes down', () => {
    const markup = renderMessage('Added [WORKER.md](drive://agents/blippy/WORKER.md).', [
        { artifactId: 'art_worker', path: 'agents/blippy/WORKER.md', revisionId: 'rev_3' },
    ]);

    expect(markup).toContain('href="/s/acme/artifacts/art_worker?revision=rev_3"');
    expect(markup).toContain('>WORKER.md</a>');
});

test('a message whose citations never resolved shows their labels as plain text', () => {
    const markup = renderMessage('Added [WORKER.md](drive://agents/blippy/WORKER.md).', [
        { artifactId: null, path: 'agents/blippy/WORKER.md', revisionId: null },
    ]);

    expect(markup).toContain('Added WORKER.md.');
    expect(markup).not.toContain('<a');
});

function renderMessage(content: string, driveCitations: DriveCitation[]) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, retryOnMount: false } },
    });
    const client = hausTrpc.createClient({
        links: [httpBatchLink({ url: 'http://127.0.0.1:1/trpc' })],
    });
    return renderToStaticMarkup(
        <MemoryRouter>
            <QueryClientProvider client={queryClient}>
                <hausTrpc.Provider client={client} queryClient={queryClient}>
                    <ServerChatMessageContent
                        agentsById={new Map()}
                        chatsById={new Map()}
                        humans={humanDirectory([], undefined)}
                        message={{
                            content,
                            driveCitations,
                            hausAgentId: null,
                            id: 'msg_1',
                            metadata: withLocalTimelineMessageMetadata(),
                            sender: 'Zach',
                            senderType: 'user',
                            sourceSessionKey: 'hosted:human',
                            timestamp: '2026-11-19T00:00:00.000Z',
                        }}
                        onOpenArtifact={() => undefined}
                        serverId="server_1"
                        slug="acme"
                    />
                </hausTrpc.Provider>
            </QueryClientProvider>
        </MemoryRouter>
    );
}
