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

const routeSteps = [
    '/s/one/chats/haus',
    '/s/one/tasks',
    '/s/one/chats/haus?message=m1',
    '/s/one/chats/haus',
];
const routeTrail = [
    '/s/one/chats/haus',
    '/s/one/chats/haus?message=m1',
    '/s/one/tasks',
    '/s/one/chats/haus',
    '/s/one/inbox',
];
const hashSteps = ['#latest', '/s/one/chats/haus#latest', '/s/one/chats/haus'];
const hashTrail = [
    '/s/one/chats/haus',
    '/s/one/chats/haus#latest',
    '/s/one/chats/haus',
    '/s/one/inbox',
];

function useRowPress() {
    const navigate = useSidebarNavigate();
    return (href: string) => navigate(href, { flushSync: true });
}

test('a sidebar row press on the route the landing replaced to adds no history entry', async () => {
    expect(await walkBackAfter(useRowPress, routeSteps)).toEqual(routeTrail);
});

test('keyboard Enter on that row, through the shell link router, adds no history entry', async () => {
    expect(await walkBackAfter(useStableNavigate, routeSteps)).toEqual(routeTrail);
});

test('a push that changes only the hash is its own entry; the same hash is not', async () => {
    expect(await walkBackAfter(useRowPress, hashSteps)).toEqual(hashTrail);
    expect(await walkBackAfter(useStableNavigate, hashSteps)).toEqual(hashTrail);
});

async function walkBackAfter(useRowNavigate: () => (href: string) => void, steps: string[]) {
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
    const visited = () => {
        const { hash, pathname, search } = router.state.location;
        return `${pathname}${search}${hash}`;
    };

    for (const step of steps) {
        await act(async () => navigate(step));
    }

    const trail = [visited()];
    while (trail.at(-1) !== '/s/one/inbox' && trail.length <= steps.length + 1) {
        await act(async () => router.navigate(-1));
        trail.push(visited());
    }
    await act(async () => root.unmount());
    return trail;
}
