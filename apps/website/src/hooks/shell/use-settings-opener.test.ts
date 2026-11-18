import { expect, test } from 'bun:test';
import { openSettingsTab } from './use-settings-opener.ts';

test('the Settings button: the singleton on a plain press, a tab beside the left pane’s on a modified one', () => {
    const calls: unknown[][] = [];
    const tabs = {
        openSettings: (...args: unknown[]) => calls.push(['openSettings', ...args]),
        openTab: (...args: unknown[]) => calls.push(['openTab', ...args]),
    };
    const settings = { kind: 'app', path: '/s/acme/settings' };
    openSettingsTab(tabs, settings.path, 'auto');
    openSettingsTab(tabs, settings.path, 'backgroundTab');
    openSettingsTab(tabs, settings.path, 'newTab');
    expect(calls).toEqual([
        ['openSettings', settings],
        ['openTab', null, settings, { background: true }],
        ['openTab', null, settings, { background: false }],
    ]);
});
