import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { WindowBand } from './window-band.tsx';

test('the window band leads with a sidebar-width traffic-light segment, then the topbar', () => {
    const markup = renderToStaticMarkup(
        <WindowBand>
            <header className="workspace-titlebar">tabs</header>
        </WindowBand>
    );

    expect(markup).toContain('data-window-drag-region=""');
    expect(markup).toMatch(
        /<div class="shell-window-band__lead" style="--app-sidebar-width:\d+px"><\/div><header class="workspace-titlebar">/u
    );
});
