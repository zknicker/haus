import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkerKeycap } from './cloud-agent-provider-mark.tsx';

test('a Worker key badges its provider once the key is large enough to read it', () => {
    const card = renderToStaticMarkup(<WorkerKeycap provider="cursor" size={40} />);
    const row = renderToStaticMarkup(<WorkerKeycap provider="cursor" size={20} />);

    expect(card).toContain('data-worker-keycap="cursor"');
    expect(card).toMatch(/height:40px;width:40px/);
    expect(card).toContain('cursor_dark.svg');
    expect(row).toContain('text-worker-mark');
    expect(row).not.toContain('cursor_dark.svg');
});

test('a pinned Claude environment wraps the key in a tooltip trigger; an unpinned one does not', () => {
    const pinned = renderToStaticMarkup(
        <WorkerKeycap environmentName="Fast" provider="claude" size={40} />
    );
    const unpinned = renderToStaticMarkup(<WorkerKeycap provider="claude" size={40} />);

    expect(pinned).toContain('data-slot="tooltip-trigger"');
    expect(unpinned).not.toContain('data-slot="tooltip-trigger"');
});
