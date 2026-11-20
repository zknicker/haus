import { afterAll, beforeAll, expect, test } from 'bun:test';
import * as React from 'react';
import { createMemoryRouter, Navigate, Outlet, RouterProvider } from 'react-router-dom';
import { installFakeDom } from '../../test-support/fake-dom.ts';
import {
    type SidebarNavigate,
    SidebarNavigateProvider,
    useSidebarNavigate,
} from './sidebar-navigate.tsx';

let restoreDom: () => void;
beforeAll(() => {
    restoreDom = installFakeDom();
});
afterAll(() => restoreDom());

test('a sidebar row for the route the landing replaced to adds no history entry', async () => {
    const { act } = React;
    const { createRoot } = await import('react-dom/client');
    let navigate: SidebarNavigate = () => undefined;
    function Sidebar() {
        navigate = useSidebarNavigate();
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
    expect(visited()).toBe('/s/one/chats/haus');

    await act(() => navigate('/s/one/chats/haus', { flushSync: true }));
    await act(() => navigate('/s/one/tasks', { flushSync: true }));
    await act(() => navigate('/s/one/chats/haus?message=m1', { flushSync: true }));
    await act(() => navigate('/s/one/chats/haus', { flushSync: true }));

    const back = async () => {
        await act(() => router.navigate(-1));
        return visited();
    };
    expect([visited(), await back(), await back(), await back(), await back()]).toEqual([
        '/s/one/chats/haus',
        '/s/one/chats/haus?message=m1',
        '/s/one/tasks',
        '/s/one/chats/haus',
        '/s/one/inbox',
    ]);

    await act(() => root.unmount());
});
