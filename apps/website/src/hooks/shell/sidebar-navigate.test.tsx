import { afterAll, beforeAll, expect, test } from 'bun:test';
import * as React from 'react';
import { createMemoryRouter, Navigate, Outlet, RouterProvider } from 'react-router-dom';
import { installFakeDom } from '../../test-support/fake-dom.ts';
import { SidebarNavigateProvider, useSidebarNavigate } from './sidebar-navigate.tsx';
import { useStableNavigate } from './use-stable-navigate.ts';

let restoreDom: () => void;
beforeAll(() => {
    restoreDom = installFakeDom();
});
afterAll(() => restoreDom());

const expectedTrail = [
    '/s/one/chats/haus',
    '/s/one/chats/haus?message=m1',
    '/s/one/tasks',
    '/s/one/chats/haus',
    '/s/one/inbox',
];

test('a sidebar row press on the route the landing replaced to adds no history entry', async () => {
    const trail = await walkBackAfter(() => {
        const navigate = useSidebarNavigate();
        return (href) => navigate(href, { flushSync: true });
    });
    expect(trail).toEqual(expectedTrail);
});

test('keyboard Enter on that row, through the shell link router, adds no history entry', async () => {
    const trail = await walkBackAfter(useStableNavigate);
    expect(trail).toEqual(expectedTrail);
});

async function walkBackAfter(useRowNavigate: () => (href: string) => void) {
    const { act } = React;
    const { createRoot } = await import('react-dom/client');
    let navigate: (href: string) => void = () => undefined;
    function Sidebar() {
        navigate = useRowNavigate();
        return <Outlet />;
    }
    const router = createMemoryRouter(
        [
            {
                path: '/s/:slug',
                element: (
                    <SidebarNavigateProvider>
                        <Sidebar />
                    </SidebarNavigateProvider>
                ),
                children: [
                    { index: true, element: <Navigate replace to="/s/one/chats/haus" /> },
                    { path: '*', element: null },
                ],
            },
        ],
        { initialEntries: ['/s/one/inbox', '/s/one'] }
    );
    const root = createRoot(document.createElement('div'));
    await act(async () => root.render(<RouterProvider router={router} />));
    const visited = () => `${router.state.location.pathname}${router.state.location.search}`;

    await act(async () => navigate('/s/one/chats/haus'));
    await act(async () => navigate('/s/one/tasks'));
    await act(async () => navigate('/s/one/chats/haus?message=m1'));
    await act(async () => navigate('/s/one/chats/haus'));

    const back = async () => {
        await act(async () => router.navigate(-1));
        return visited();
    };
    const trail = [visited(), await back(), await back(), await back(), await back()];
    await act(async () => root.unmount());
    return trail;
}
