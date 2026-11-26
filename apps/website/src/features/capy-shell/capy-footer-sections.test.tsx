import { expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { observable } from '@trpc/server/observable';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { SidebarNavigateProvider } from '../../hooks/shell/sidebar-navigate.tsx';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { CapyFooterSections } from './capy-footer-sections.tsx';

function render(path: string) {
    const queryClient = new QueryClient();
    const client = hausTrpc.createClient({
        links: [() => () => observable(() => () => undefined)],
    });
    return renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
            <hausTrpc.Provider client={client} queryClient={queryClient}>
                <MemoryRouter initialEntries={[path]}>
                    <SidebarNavigateProvider>
                        <CapyFooterSections serverId="srv_render" slug="render" />
                    </SidebarNavigateProvider>
                </MemoryRouter>
            </hausTrpc.Provider>
        </QueryClientProvider>
    );
}

test('the footer sections are links a modified click can open in a new tab', () => {
    const links = [...render('/s/render').matchAll(/<a [^>]*href="([^"]+)"/gu)].map(
        (match) => match[1]
    );
    expect(links).toEqual([
        '/s/render/issues',
        '/s/render/tasks',
        '/s/render/artifacts',
        '/s/render/activity',
    ]);
});

test('the section you are on is the current page', () => {
    const html = render('/s/render/activity');
    expect(html.match(/<a [^>]*aria-current="page"[^>]*>/gu)?.join('')).toContain(
        'aria-label="Activity"'
    );
    expect(html.match(/aria-current="page"/gu)).toHaveLength(1);
});
