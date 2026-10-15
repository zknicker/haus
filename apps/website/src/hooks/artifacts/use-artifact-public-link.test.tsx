import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { ArtifactPublicLink } from '@haus/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import * as React from 'react';
import type { Root } from 'react-dom/client';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { installFakeDom } from '../../test-support/fake-dom.ts';
import {
    useArtifactPublicLink,
    useArtifactPublicLinkMutations,
} from './use-artifact-public-link.ts';

let restoreDom: () => void;
beforeAll(() => {
    restoreDom = installFakeDom();
});
afterAll(() => restoreDom());

const serverId = 'srv_one';
const artifactId = 'art_design';
const link: ArtifactPublicLink = {
    can_disable: true,
    created_at: '2026-10-15T00:00:00.000Z',
    creator: { type: 'user', user_id: 'usr_ada' },
    url: 'https://haus.test/f/abcdefghijklmnopqrstuvwxyz012345',
};

test('enable shows the link at once and disable clears it, with no extra reads', async () => {
    const harness = await mount();
    expect(harness.view.link).toBeNull();
    let url = '';
    await harness.act(async () => {
        url = await harness.view.actions.enable(artifactId);
    });
    expect(url).toBe(link.url);
    expect(harness.view.link).toEqual(link);
    await harness.act(() => harness.view.actions.disable(artifactId));
    expect(harness.view.link).toBeNull();
    expect(harness.paths).toEqual(['artifact.publicLink', 'artifact.share', 'artifact.unshare']);
    await harness.unmount();
});

async function mount() {
    const { act } = React;
    const { createRoot } = await import('react-dom/client');
    const paths: string[] = [];
    const responses: Record<string, unknown> = {
        'artifact.publicLink': { artifact_id: artifactId, link: null },
        'artifact.share': { artifact_id: artifactId, link },
        'artifact.unshare': { artifact_id: artifactId, link: null },
    };
    const trpcLink: TRPCLink<never> =
        () =>
        ({ op }) =>
            observable((observer) => {
                paths.push(op.path);
                const timer = setTimeout(() => {
                    observer.next({ result: { data: responses[op.path] } });
                    observer.complete();
                }, 1);
                return () => clearTimeout(timer);
            });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const client = hausTrpc.createClient({ links: [trpcLink as never] });
    const view = {} as {
        actions: ReturnType<typeof useArtifactPublicLinkMutations>;
        link: ArtifactPublicLink | null;
    };
    function Probe() {
        view.link = useArtifactPublicLink(serverId, artifactId);
        view.actions = useArtifactPublicLinkMutations(serverId);
        return null;
    }
    let root: Root | undefined;
    await act(async () => {
        root = createRoot(document.createElement('div') as unknown as Element);
        root.render(
            <QueryClientProvider client={queryClient}>
                <hausTrpc.Provider client={client} queryClient={queryClient}>
                    <Probe />
                </hausTrpc.Provider>
            </QueryClientProvider>
        );
    });
    const settle = async () => {
        for (let pass = 0; pass < 5; pass += 1) {
            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, 5));
            });
        }
    };
    await settle();
    return {
        act: async (work: () => Promise<unknown>) => {
            await act(async () => {
                await work();
            });
            await settle();
        },
        paths,
        unmount: async () => {
            await act(async () => {
                root?.unmount();
                queryClient.clear();
            });
        },
        view,
    };
}
