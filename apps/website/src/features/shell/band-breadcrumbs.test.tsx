import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BandBreadcrumbs } from './band-breadcrumbs.tsx';
import type { BandCrumb } from './band-trail.ts';

function render(crumbs: BandCrumb[], current: string) {
    return renderToStaticMarkup(
        <MemoryRouter initialEntries={['/s/acme/page']}>
            <Routes>
                <Route
                    element={<BandBreadcrumbs crumbs={crumbs} current={{ label: current }} />}
                    path="/s/:slug/page"
                />
            </Routes>
        </MemoryRouter>
    );
}

const links = (html: string) => [...html.matchAll(/<a [^>]*href="([^"]+)"/gu)].map((m) => m[1]);

test('a section page reads Haus › Section, with only Haus a link', () => {
    const html = render([], 'Tasks');
    expect(links(html)).toEqual(['/s/acme/inbox']);
    expect(html).toContain('Haus');
    expect(html).toMatch(/aria-current="page"[^>]*>Tasks</u);
});

test('a deeper trail links every crumb before the current page', () => {
    const html = render(
        [
            { href: '/s/acme/settings', label: 'Settings' },
            { href: '/s/acme/settings/members', label: 'Members' },
        ],
        'Ada'
    );
    expect(links(html)).toEqual(['/s/acme/inbox', '/s/acme/settings', '/s/acme/settings/members']);
    expect(html).toMatch(/aria-current="page"[^>]*>Ada</u);
});

test('a deep trail folds its middle, keeping the section and the parent', () => {
    const folders = ['Files', 'a', 'b', 'c', 'd'].map((label) => ({
        href: `/s/acme/artifacts?folder=${label}`,
        label,
    }));
    const html = render(folders, 'e');
    expect(links(html)).toEqual([
        '/s/acme/inbox',
        '/s/acme/artifacts?folder=Files',
        '/s/acme/artifacts?folder=d',
    ]);
    expect(html).toContain('aria-label="Show enclosing places"');
});
