import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { AppShell, AppShellDragRegion } from './app-shell.tsx';

describe('AppShell drag regions', () => {
    test('marks the transparent top strip as a native drag region', () => {
        const markup = renderToStaticMarkup(<AppShellDragRegion />);

        expect(markup).toContain('data-slot="app-shell-drag-region"');
        expect(markup).toContain('data-window-drag-region=""');
    });
});

test('paints the transparent desktop window with the HeroUI page background', () => {
    const markup = renderToStaticMarkup(<AppShell>Content</AppShell>);
    const theme = readFileSync(join(import.meta.dir, '../../styles/default-theme.css'), 'utf8');

    // The ground is the page background unless a Canvas or Band window layout re-points it.
    expect(markup).toContain('bg-(--app-shell-ground)');
    expect(theme).toContain('--app-shell-ground: var(--background);');
});
