import { afterAll, beforeAll, expect, test } from 'bun:test';
import * as React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { installFakeDom } from '../../test-support/fake-dom.ts';
import { useOpenAgentProfile } from '../agents/use-open-agent-profile.ts';
import { useStableNavigate } from './use-stable-navigate.ts';

let restoreDom: () => void;
beforeAll(() => {
    restoreDom = installFakeDom();
});
afterAll(() => restoreDom());

// Openers handed to a context or to many rows must not change with the route:
// a new identity re-renders every reader on every navigation.
test('router openers keep one identity across navigations and act on the latest route', async () => {
    const { act } = React;
    const { createRoot } = await import('react-dom/client');
    const navigates: ((href: string) => void)[] = [];
    const openers: ReturnType<typeof useOpenAgentProfile>[] = [];
    const paths: string[] = [];
    function Probe() {
        navigates.push(useStableNavigate());
        openers.push(useOpenAgentProfile());
        paths.push(useLocation().pathname);
        return null;
    }
    const root = createRoot(document.createElement('div'));
    await act(() =>
        root.render(
            <MemoryRouter initialEntries={['/s/one/chats/a']}>
                <Routes>
                    <Route element={<Probe />} path="/s/:slug/*" />
                </Routes>
            </MemoryRouter>
        )
    );

    await act(() => navigates.at(-1)?.('/s/two/chats/b'));
    await act(() => openers.at(-1)?.('agt_tiny'));

    expect(paths).toEqual(['/s/one/chats/a', '/s/two/chats/b', '/s/two/agents/agt_tiny/home']);
    expect(new Set(navigates).size).toBe(1);
    expect(new Set(openers).size).toBe(1);

    await act(() => root.unmount());
});
