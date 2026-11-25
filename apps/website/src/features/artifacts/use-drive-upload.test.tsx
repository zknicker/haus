import { afterAll, beforeAll, expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import type { ArtifactUploadState } from '../../hooks/artifacts/use-artifact-upload.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { installFakeDom } from '../../test-support/fake-dom.ts';
import { type DriveUpload, useDriveUpload } from './use-drive-upload.tsx';

let restoreDom: () => void;
beforeAll(() => {
    restoreDom = installFakeDom();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
});
afterAll(() => restoreDom());

test('a file picked in a folder view uploads to its full Drive path', async () => {
    const harness = await mount('haus');
    expect(await harness.pick('Upload files', 'AGENTS.md')).toEqual({
        rejected: [],
        replacements: ['haus/AGENTS.md'],
    });
    expect(harness.prefixes).toEqual(['haus']);
    await harness.unmount();
});

test('a folder pick after opening another folder lands in the folder now open', async () => {
    const harness = await mount('haus');
    await harness.open('agents/beacon/notes');
    expect(await harness.pick('Upload a folder', 'drafts/plan.md')).toEqual({
        rejected: [],
        replacements: ['agents/beacon/notes/drafts/plan.md'],
    });
    expect(harness.prefixes).toEqual(['agents/beacon/notes']);
    await harness.unmount();
});

test('without a folder to land in, there is nothing to pick into', async () => {
    const harness = await mount(null);
    expect(findInput(harness.upload().dialogs, 'Upload files')).toBeNull();
    await harness.unmount();
});

interface Rendered {
    folder: string | null;
    upload: DriveUpload;
}

async function mount(initial: string | null) {
    const prefixes: string[] = [];
    const link: TRPCLink<never> =
        () =>
        ({ op }) =>
            observable((observer) => {
                const { prefix } = op.input as { prefix: string };
                prefixes.push(prefix);
                const artifacts = ['AGENTS.md', 'drafts/plan.md'].map((name) => ({
                    path: `${prefix}/${name}`,
                    sha256: 'stale',
                }));
                observer.next({ result: { data: { artifacts, next_offset: null } } });
                observer.complete();
            });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const client = hausTrpc.createClient({ links: [link as never] });
    const waiters = new Set<(rendered: Rendered) => boolean>();
    let latest: Rendered | null = null;
    function Probe({ folder }: { folder: string | null }) {
        const upload = useDriveUpload('srv_one', folder);
        const rendered = { folder, upload };
        React.useEffect(() => {
            latest = rendered;
            for (const waiter of waiters) {
                if (waiter(rendered)) {
                    waiters.delete(waiter);
                }
            }
        });
        return null;
    }
    const until = (done: (rendered: Rendered) => boolean) =>
        new Promise<Rendered>((resolve) => {
            waiters.add((rendered) => {
                if (!done(rendered)) {
                    return false;
                }
                resolve(rendered);
                return true;
            });
        });
    const root = createRoot(document.createElement('div') as unknown as Element);
    const render = (folder: string | null) => {
        const rendered = until((next) => next.folder === folder);
        root.render(
            <QueryClientProvider client={queryClient}>
                <hausTrpc.Provider client={client} queryClient={queryClient}>
                    <Probe folder={folder} />
                </hausTrpc.Provider>
            </QueryClientProvider>
        );
        return rendered;
    };
    await render(initial);
    const upload = () => {
        if (!latest) {
            throw new Error('The probe has not rendered.');
        }
        return latest.upload;
    };
    return {
        open: render,
        pick: async (label: string, relativePath: string) => {
            const input = findInput(upload().dialogs, label);
            if (!input) {
                throw new Error(`No "${label}" input.`);
            }
            const name = relativePath.slice(relativePath.lastIndexOf('/') + 1);
            const file = new File(['# Plan\n'], name);
            Object.defineProperty(file, 'webkitRelativePath', {
                value: relativePath.includes('/') ? relativePath : '',
            });
            const settled = until((next) => {
                const { phase } = uploadState(next.upload);
                return phase === 'confirm' || phase === 'done';
            });
            input.props.onChange({ currentTarget: { files: [file], value: name } });
            return planPaths(uploadState((await settled).upload));
        },
        prefixes,
        unmount: () => {
            root.unmount();
            queryClient.clear();
            return new Promise<void>((resolve) => {
                createRoot(document.createElement('div') as unknown as Element).render(
                    <Flushed onFlushed={resolve} />
                );
            });
        },
        upload,
    };
}

function Flushed({ onFlushed }: { onFlushed: () => void }) {
    React.useEffect(onFlushed);
    return null;
}

type InputElement = React.ReactElement<{
    'aria-label'?: string;
    onChange: (event: unknown) => void;
}>;

function findInput(tree: React.ReactNode, label: string) {
    const pending: React.ReactNode[] = [tree];
    while (pending.length > 0) {
        const node = pending.pop();
        if (Array.isArray(node)) {
            pending.push(...node);
        } else if (
            React.isValidElement<{ 'aria-label'?: string; children?: React.ReactNode }>(node)
        ) {
            if (node.type === 'input' && node.props['aria-label'] === label) {
                return node as InputElement;
            }
            pending.push(node.props.children);
        }
    }
    return null;
}

function uploadState(upload: DriveUpload) {
    const status = upload.status as React.ReactElement<{ state: ArtifactUploadState }>;
    return status.props.state;
}

function planPaths(state: ArtifactUploadState) {
    if (state.phase === 'confirm') {
        return {
            rejected: state.plan.rejected.map((entry) => entry.path),
            replacements: state.plan.replacements.map((entry) => entry.path),
        };
    }
    const failures = state.phase === 'done' ? state.progress.failures : [];
    return { rejected: failures.map((entry) => entry.path), replacements: [] };
}
