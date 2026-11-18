import { afterAll, expect, test } from 'bun:test';
import * as React from 'react';
import { installFakeDom } from '../../test-support/fake-dom.ts';
import { createRenderCensus } from '../../test-support/render-census.tsx';

// Desktop tabs hide under `<Activity>`, which tears effects down and re-runs
// them on reveal. Stock Radix Avatar reset its image status to idle in that
// teardown, so every avatar re-rendered on hide and again on reveal (three
// components each, every avatar of every transcript row). The patched
// dependency keeps a loaded image loaded (`patches/@radix-ui%2Freact-avatar@1.2.6.patch`).
//
// Radix picks its layout-effect hook once, when its module first loads, and
// without a document it picks a no-op. Another test file in the same run may
// load it first, so this file re-runs itself in a fresh process when images
// never load here.

const restoreDom = installFakeDom();
const scope = globalThis as Record<string, unknown>;
const savedImage = scope.Image;
afterAll(() => {
    scope.Image = savedImage;
    restoreDom();
});
// A cached image: complete and decoded the moment its src is set.
scope.Image = class {
    complete = true;
    crossOrigin: string | null = null;
    naturalWidth = 32;
    src = '';
    addEventListener() {
        // Already loaded; no events.
    }
    removeEventListener() {
        // Already loaded; no events.
    }
};

const { EntityAvatar } = await import('./entity-avatar.tsx');
const { createRoot } = await import('react-dom/client');
const { act } = React;

if (await imagesLoadHere()) {
    test('hiding and revealing a loaded avatar renders none of it', async () => {
        const { census, CensusRoot, observe } = createRenderCensus();
        const container = document.createElement('div');
        observe(container);
        const root = createRoot(container);
        const show = (mode: 'hidden' | 'visible') =>
            act(() =>
                root.render(
                    <CensusRoot>
                        <React.Activity mode={mode}>
                            <EntityAvatar name="Blippy" src="/avatars/blippy.png" />
                        </React.Activity>
                    </CensusRoot>
                )
            );
        await show('visible');
        expect(census.renders()).toContain('Primitive.img');

        census.reset();
        await show('hidden');
        await show('visible');

        expect(census.renders().filter((name) => name !== 'CensusRoot')).toEqual([]);
        await act(() => root.unmount());
    });

    test('an avatar whose image goes away shows its initials', async () => {
        const container = document.createElement('div');
        const root = createRoot(container);
        await act(() => root.render(<EntityAvatar name="Blippy" src="/avatars/blippy.png" />));
        expect(container.textContent).toBe('');

        await act(() => root.render(<EntityAvatar name="Blippy" src={null} />));
        expect(container.textContent).toBe('BL');
        await act(() => root.unmount());
    });
} else {
    test('avatar reveal tests pass in a fresh process', () => {
        const run = Bun.spawnSync([process.execPath, 'test', import.meta.path], {
            env: { ...process.env, HAUS_AVATAR_REVEAL_ISOLATED: '1' },
        });
        expect(run.stderr.toString()).toContain(' 2 pass');
        expect(run.exitCode).toBe(0);
    });
}

async function imagesLoadHere() {
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(() => root.render(<EntityAvatar name="Blippy" src="/avatars/probe.png" />));
    const loaded = container.textContent === '';
    await act(() => root.unmount());
    if (!loaded && process.env.HAUS_AVATAR_REVEAL_ISOLATED === '1') {
        throw new Error('avatar images never load, even in a fresh process');
    }
    return loaded;
}
