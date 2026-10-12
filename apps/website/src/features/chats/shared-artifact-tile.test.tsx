import { expect, test } from 'bun:test';
import type { ArtifactMetadata } from '@haus/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { getQueryKey } from '@trpc/react-query';
import type * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { MarkdownLink } from './chat-inline-markdown-link.tsx';
import { SharedArtifactScopeProvider } from './shared-artifact-scope.tsx';
import { SharedArtifactTile } from './shared-artifact-tile.tsx';

const serverId = 'server_1';
const scope = { origins: ['https://app.haus.test'], serverId, slug: 'acme' };
const href = 'https://app.haus.test/s/acme/artifacts/art_deck';

test('a library link becomes an in-app reference chip once its artifact reads', () => {
    const markup = render(
        seeded([artifact('art_deck', 'Launch deck', 'deck.pdf', 'application/pdf')]),
        <ScopedLink />
    );

    expect(markup).toContain('reference-chip--artifact');
    expect(markup).toContain('Launch deck');
    expect(markup).toContain('--artifact-kind-pdf');
    expect(markup).toContain('href="/s/acme/artifacts/art_deck"');
    expect(markup).not.toContain('target="_blank"');
});

test('an unreadable library link stays the written link and still opens in the App', () => {
    const markup = render(new QueryClient(), <ScopedLink />);

    expect(markup).not.toContain('reference-chip');
    expect(markup).toContain('the deck');
    expect(markup).toContain('href="/s/acme/artifacts/art_deck"');
    expect(markup).not.toContain('target="_blank"');
});

test('a foreign artifact URL stays an external link', () => {
    const markup = render(
        new QueryClient(),
        <SharedArtifactScopeProvider origins={scope.origins} serverId={serverId} slug="acme">
            <MarkdownLink href="https://evil.test/s/acme/artifacts/art_deck">deck</MarkdownLink>
        </SharedArtifactScopeProvider>
    );

    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('href="https://evil.test/s/acme/artifacts/art_deck"');
});

test('a read artifact is a strip tile with its title and "Kind · creator"', () => {
    const queryClient = seeded([
        artifact('art_a', 'Concept render', 'concept.png', 'image/png', 2048),
        artifact('art_b', 'Notes', 'notes.md', 'text/markdown', 512),
    ]);
    const markup = render(
        queryClient,
        <>
            <SharedArtifactTile scope={scope} target={{ artifactId: 'art_a' }} />
            <SharedArtifactTile scope={scope} target={{ artifactId: 'art_b' }} />
        </>
    );

    expect(markup.match(/data-testid="shared-artifact-tile"/gu)).toHaveLength(2);
    expect(markup).toContain('chat-attachment--strip-tile');
    expect(markup).toContain('data-media-strip-tile');
    expect(markup).toContain('Document · Blippy');
    expect(markup).toContain('Image · Blippy');
    expect(markup).toContain('aria-label="Open Concept render, Image"');
    expect(markup).toContain('href="/s/acme/artifacts/art_b"');
    // Until a small raster's photo decodes (its signed URL is still loading here) it shows its kind icon.
    expect(markup).toContain('--artifact-kind-image');
});

test('an artifact still reading holds a blank tile box', () => {
    const markup = render(
        new QueryClient(),
        <SharedArtifactTile scope={scope} target={{ artifactId: 'art_slow' }} />
    );

    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain('shared-artifact-tile');
});

test('an artifact that is missing renders no tile', () => {
    const queryClient = new QueryClient();
    const key = getQueryKey(
        hausTrpc.artifact.get,
        { artifact_id: 'art_missing', revision_id: undefined, serverId },
        'query'
    );
    queryClient
        .getQueryCache()
        .build(queryClient, { queryKey: key })
        .setState({
            error: new Error('NOT_FOUND'),
            status: 'error',
        });
    const markup = render(
        queryClient,
        <SharedArtifactTile scope={scope} target={{ artifactId: 'art_missing' }} />
    );

    expect(markup).toBe('');
});

function ScopedLink() {
    return (
        <SharedArtifactScopeProvider origins={scope.origins} serverId={serverId} slug="acme">
            <MarkdownLink href={href}>the deck</MarkdownLink>
        </SharedArtifactScopeProvider>
    );
}

function seeded(artifacts: ArtifactMetadata[]) {
    const queryClient = new QueryClient();
    for (const item of artifacts) {
        queryClient.setQueryData(
            getQueryKey(
                hausTrpc.artifact.get,
                { artifact_id: item.artifact_id, revision_id: undefined, serverId },
                'query'
            ),
            { artifact: item }
        );
    }
    queryClient.setQueryData(getQueryKey(hausTrpc.agent.list, { serverId }, 'query'), [
        { avatarUrl: null, displayName: 'Blippy', handle: 'blippy', id: 'agent_1' },
    ]);
    return queryClient;
}

function artifact(
    id: string,
    title: string,
    filename: string,
    contentType: string,
    size = 1024
): ArtifactMetadata {
    return {
        artifact_id: id,
        content_type: contentType,
        creator: { agent_id: 'agent_1', type: 'agent' },
        filename,
        revision_id: `${id}_r1`,
        revision_number: 1,
        size_bytes: size,
        stable_url: `https://app.haus.test/s/acme/artifacts/${id}`,
        title,
        updated_at: '2026-10-01T00:00:00.000Z',
    } as ArtifactMetadata;
}

function render(queryClient: QueryClient, children: React.ReactNode) {
    queryClient.setDefaultOptions({ queries: { retry: false, retryOnMount: false } });
    const client = hausTrpc.createClient({
        links: [httpBatchLink({ url: 'http://127.0.0.1:1/trpc' })],
    });
    return renderToStaticMarkup(
        <MemoryRouter>
            <QueryClientProvider client={queryClient}>
                <hausTrpc.Provider client={client} queryClient={queryClient}>
                    {children}
                </hausTrpc.Provider>
            </QueryClientProvider>
        </MemoryRouter>
    );
}
