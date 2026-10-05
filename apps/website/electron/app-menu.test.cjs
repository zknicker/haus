'use strict';

const { EventEmitter } = require('node:events');
const { expect, test } = require('bun:test');
const { installAppMenu } = require('./app-menu.cjs');

/** A fake menu bar: the last installed template, and the focused window. */
function harness(platform = 'darwin') {
    const app = Object.assign(new EventEmitter(), { name: 'Haus' });
    const installed = [];
    let focused = null;
    const runs = [];
    const menu = installAppMenu({
        actions: { ...actionsWith(runs) },
        app,
        BrowserWindow: { getFocusedWindow: () => focused },
        Menu: {
            buildFromTemplate: (template) => template,
            setApplicationMenu: (template) => installed.push(template),
        },
        platform,
    });
    const focus = (window) => {
        focused = window;
        app.emit('browser-window-focus', {}, window);
    };
    const submenu = (label) => installed.at(-1).find((item) => item.label === label)?.submenu;
    const item = (menuLabel, label) =>
        submenu(menuLabel).find((candidate) => candidate.label === label);
    return { focus, installed, item, menu, runs, submenu };
}

function actionsWith(runs) {
    return {
        history: () => undefined,
        newWindow: () => undefined,
        openDevtools: () => undefined,
        openSettings: () => undefined,
        openWebsite: () => undefined,
        run: (action) => runs.push(action),
        toggleDevMode: () => undefined,
        toggleSidebar: () => runs.push('toggle-sidebar'),
    };
}

const allTabs = {
    duplicate: true,
    moveToNewWindow: true,
    moveToOtherPane: true,
    selectOther: true,
};

test('the Tab menu sits between Go and Window and runs shared window actions', () => {
    const h = harness();
    const labels = h.installed.at(-1).map((item) => item.label ?? item.role);
    expect(labels).toEqual([
        'Haus',
        'File',
        'Edit',
        'View',
        'Go',
        'Tab',
        'windowMenu',
        'Developer',
        'help',
    ]);
    const tabItems = h.submenu('Tab').filter((item) => item.label);
    expect(tabItems.map((item) => [item.label, item.accelerator])).toEqual([
        ['Select Next Tab', 'Alt+CmdOrCtrl+Right'],
        ['Select Previous Tab', 'Alt+CmdOrCtrl+Left'],
        ['Duplicate Tab', undefined],
        ['Move Tab to New Window', undefined],
        ['Move Tab to Other Pane', undefined],
    ]);
    for (const item of tabItems) {
        item.click();
    }
    expect(h.runs).toEqual([
        'next-tab',
        'previous-tab',
        'duplicate-tab',
        'move-tab-to-new-window',
        'move-tab-to-other-pane',
    ]);
});

test('Tab items follow the focused window’s report and stay disabled before one', () => {
    const h = harness();
    const one = {};
    const two = {};
    h.focus(one);
    expect(
        h
            .submenu('Tab')
            .filter((item) => item.label)
            .every((item) => !item.enabled)
    ).toBe(true);
    h.menu.report(one, { tabs: { ...allTabs, moveToNewWindow: false } });
    expect(h.item('Tab', 'Duplicate Tab').enabled).toBe(true);
    expect(h.item('Tab', 'Move Tab to New Window').enabled).toBe(false);
    h.menu.report(two, { tabs: allTabs });
    // Another window's report does not touch the focused one's menu…
    expect(h.item('Tab', 'Move Tab to New Window').enabled).toBe(false);
    // …until it takes focus.
    h.focus(two);
    expect(h.item('Tab', 'Move Tab to New Window').enabled).toBe(true);
});

test('View carries Reload Page and a sidebar toggle labelled by the sidebar’s state', () => {
    const h = harness();
    const window = {};
    h.focus(window);
    expect(h.item('View', 'Reload Page').accelerator).toBe('CmdOrCtrl+R');
    expect(h.item('View', 'Hide Sidebar').enabled).toBe(false);
    h.menu.report(window, { sidebarOpen: false });
    const show = h.item('View', 'Show Sidebar');
    expect(show).toMatchObject({ accelerator: 'Ctrl+Cmd+S', enabled: true });
    // Partial reports merge.
    h.menu.report(window, { tabs: allTabs });
    expect(h.item('View', 'Show Sidebar')).toBeDefined();
    show.click();
    h.item('View', 'Reload Page').click();
    expect(h.runs).toEqual(['toggle-sidebar', 'reload']);
});

test('an unchanged state does not rebuild the menu; a malformed report throws', () => {
    const h = harness();
    const window = {};
    h.focus(window);
    h.menu.report(window, { sidebarOpen: true });
    const count = h.installed.length;
    h.menu.report(window, { sidebarOpen: true });
    expect(h.installed).toHaveLength(count);
    expect(() => h.menu.report(window, { tabs: { duplicate: 'yes' } })).toThrow();
    expect(() => h.menu.report(window, null)).toThrow();
});

test('off macOS there is no app-name menu and the sidebar key avoids Command', () => {
    const h = harness('linux');
    expect(h.installed.at(-1)[0].label).toBe('File');
    expect(h.item('View', 'Hide Sidebar').accelerator).toBe('Ctrl+Shift+S');
});
