import { describe, expect, test } from 'bun:test';
import { createDesktopTabsStore } from '../desktop-tabs/desktop-tabs-store.ts';
import { describeTabs, start } from '../desktop-tabs/desktop-tabs-test-fixtures.ts';
import { createDesktopTabCommands } from '../desktop-tabs/use-desktop-tabs-controller.ts';
import { openDesktopProviderTab } from './desktop-provider-tab.ts';
import { providerReturnPath } from './provider-return-path.ts';

const settings = '/s/acme/settings/connections/mcp_1';
const landing = `https://haus.chat${settings}?linear_setup=workspace_reconnected`;

/** A Settings tab, a fake Electron browser state stream, and one started flow. */
function world() {
    const store = createDesktopTabsStore(start('settings/connections/mcp_1'));
    const tabs = createDesktopTabCommands(store, { route: '/s/acme', serverId: 'srv_1' });
    const listeners = new Set<(value: unknown) => void>();
    const bridge = {
        onBrowserState: (listener: (value: unknown) => void) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
    const publish = (url: string) => {
        for (const listener of [...listeners]) {
            listener({ tabs: [view(url)] });
        }
    };
    openDesktopProviderTab({
        bridge,
        fromTabId: 't0',
        returns: (url) =>
            providerReturnPath(url, { origins: ['https://haus.chat'], serverPath: '/s/acme' }),
        tabs,
        title: 'Linear',
        url: 'https://linear.app/oauth/authorize?state=s',
        viewId: 'v1',
    });
    return { listeners, publish, store, tabs };
}

describe('desktop provider tab', () => {
    test('opens the provider beside the starting tab', () => {
        const { store } = world();
        expect(describeTabs(store.latest())).toEqual({
            focused: 'secondary',
            primary: 'settings/connections/mcp_1*',
            secondary: 'web:v1*',
        });
    });

    test('a landing on the App closes the provider tab and shows the outcome in the starting tab', () => {
        const { listeners, publish, store } = world();
        publish('https://linear.app/oauth/authorize?state=s');
        expect(Object.keys(store.latest().tabs)).toHaveLength(2);
        publish(landing);
        expect(describeTabs(store.latest())).toEqual({
            focused: 'primary',
            primary: 'settings/connections/mcp_1?linear_setup=workspace_reconnected*',
            secondary: '-',
        });
        expect(listeners.size).toBe(0);
    });

    test('with the starting tab gone, the provider tab turns into the returned page', () => {
        const { publish, store, tabs } = world();
        tabs.close(['t0']);
        publish(landing);
        const state = store.latest();
        const [only] = Object.values(state.tabs);
        expect(Object.keys(state.tabs)).toHaveLength(1);
        expect(only?.history.entries[only.history.index]?.location).toEqual({
            kind: 'app',
            path: `${settings}?linear_setup=workspace_reconnected`,
        });
    });

    test('closing the provider tab stops the watch with nothing handed back', () => {
        const { listeners, publish, store, tabs } = world();
        const webTab = Object.keys(store.latest().tabs).find((id) => id !== 't0') ?? '';
        tabs.close([webTab]);
        expect(listeners.size).toBe(0);
        publish(landing);
        expect(describeTabs(store.latest()).primary).toBe('settings/connections/mcp_1*');
    });
});

function view(url: string) {
    return {
        canGoBack: false,
        canGoForward: false,
        error: null,
        faviconUrl: null,
        find: null,
        id: 'v1',
        loading: false,
        title: 'Linear',
        url,
        zoomFactor: 1,
    };
}
