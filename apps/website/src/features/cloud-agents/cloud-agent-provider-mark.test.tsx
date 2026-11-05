import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { CloudAgentKeycap } from './cloud-agent-provider-mark.tsx';

test('a cloud agent key badges its provider once the key is large enough to read it', () => {
    const card = renderToStaticMarkup(<CloudAgentKeycap provider="cursor" size={40} />);
    const row = renderToStaticMarkup(<CloudAgentKeycap provider="cursor" size={20} />);

    expect(card).toContain('data-cloud-agent-keycap="cursor"');
    expect(card).toMatch(/height:40px;width:40px/);
    expect(card).toContain('cursor_dark.svg');
    // At a Thread row's 20px the badge would be a smudge: the terminal stands alone.
    expect(row).toContain('text-cloud-agent-mark');
    expect(row).not.toContain('cursor_dark.svg');
});

test('a pinned Claude environment wraps the key in a tooltip trigger; an unpinned one does not', () => {
    const pinned = renderToStaticMarkup(
        <CloudAgentKeycap environmentName="Fast" provider="claude" size={40} />
    );
    const unpinned = renderToStaticMarkup(<CloudAgentKeycap provider="claude" size={40} />);

    expect(pinned).toContain('data-slot="tooltip-trigger"');
    expect(unpinned).not.toContain('data-slot="tooltip-trigger"');
});
