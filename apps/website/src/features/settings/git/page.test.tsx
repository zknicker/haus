import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { GitSettings } from './page.tsx';

test('Git states what Captains and Workers commit and push as, with nothing to change', () => {
    const html = renderToStaticMarkup(
        <MemoryRouter initialEntries={['/s/haus/settings/git']}>
            <Routes>
                <Route element={<GitSettings />} path="/s/:slug/settings/git" />
            </Routes>
        </MemoryRouter>
    );

    expect(html).toContain('Captains');
    expect(html).toContain('haus/');
    expect(html).toContain('Haus bot, requester co-author');
    expect(html).toContain('Haus GitHub App');
    expect(html).not.toContain('Coming soon');
    expect(html).toContain('Workers');
    expect(html).toContain('The device’s git login');
    expect(html).not.toMatch(/<input|role="switch"|data-slot="select"/u);
    expect(html).toMatch(/<a[^>]*href="\/s\/haus\/settings\/repos"/u);
});
