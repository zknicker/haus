import { expect, test } from 'bun:test';
import type { DriveCitation } from '@haus/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import type * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { ReferenceMarkdown } from '../mentions/reference-markdown.tsx';
import { renderInlineMarkdown } from './chat-inline-markdown-renderer.tsx';
import { SharedArtifactScopeProvider } from './shared-artifact-scope.tsx';

const citations: DriveCitation[] = [
    { artifactId: 'art_worker', path: 'agents/blippy/WORKER.md', revisionId: 'rev_3' },
    { artifactId: null, path: 'notes/later.md', revisionId: null },
];

test('a resolved drive citation opens its cited revision in the App', () => {
    const markup = renderSettled('I added it to [WORKER.md](drive://agents/blippy/WORKER.md).');

    expect(markup).toContain('href="/s/acme/artifacts/art_worker?revision=rev_3"');
    expect(markup).toContain('>WORKER.md</a>');
    expect(markup).not.toContain('target="_blank"');
});

test('an unresolved drive citation renders its label as plain text', () => {
    const markup = renderSettled('See [the notes](drive://notes/later.md) soon.');

    expect(markup).toContain('See the notes soon.');
    expect(markup).not.toContain('<a');
});

test('a drive link the message did not cite renders its label as plain text', () => {
    const markup = renderSettled('See [Tiny](drive://agents/tiny/WORKER.md).');

    expect(markup).toContain('See Tiny.');
    expect(markup).not.toContain('<a');
});

test('a streaming drive citation opens its cited revision too', () => {
    const markup = render(
        <>
            {renderInlineMarkdown('[WORKER.md](drive://agents/blippy/WORKER.md)', 'prose', 0, {
                animatedRanges: [],
                sourceOffset: 0,
            })}
        </>
    );

    expect(markup).toContain('href="/s/acme/artifacts/art_worker?revision=rev_3"');
    expect(markup).toContain('>WORKER.md</a>');
});

function renderSettled(content: string) {
    return render(<ReferenceMarkdown content={content} />);
}

function render(children: React.ReactNode) {
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
                    <SharedArtifactScopeProvider
                        driveCitations={citations}
                        origins={['https://app.haus.test']}
                        serverId="server_1"
                        slug="acme"
                    >
                        {children}
                    </SharedArtifactScopeProvider>
                </hausTrpc.Provider>
            </QueryClientProvider>
        </MemoryRouter>
    );
}
