import { afterAll, beforeAll, expect, test } from 'bun:test';
import { type NavigateFunction, useNavigate } from 'react-router-dom';
import { SidebarNavigateProvider } from '../../hooks/shell/sidebar-navigate.tsx';
import { installKeptChatViewTestDom } from '../../test-support/kept-chat-views-harness.tsx';
import {
    createTranscriptHarness,
    installTranscriptBrowserStubs,
    serverId,
} from '../../test-support/transcript-render-harness.tsx';
import { CapyFooterSections } from './capy-footer-sections.tsx';

installKeptChatViewTestDom();
let restoreStubs: () => void;
beforeAll(() => {
    restoreStubs = installTranscriptBrowserStubs();
});
afterAll(() => restoreStubs());

let navigate: NavigateFunction | null = null;

function RouteDriver() {
    navigate = useNavigate();
    return null;
}

test('a route change leaves the Automations menu unrendered', async () => {
    const harness = createTranscriptHarness();
    const view = await harness.mount(
        <SidebarNavigateProvider>
            <CapyFooterSections serverId={serverId} slug="render" />
            <RouteDriver />
        </SidebarNavigateProvider>
    );

    const census = await harness.change(() => navigate?.('/s/render/tasks'));

    expect(census.count('RouteDriver')).toBe(1);
    expect(census.count('AutomationsMenu')).toBe(0);

    await view.unmount();
});
