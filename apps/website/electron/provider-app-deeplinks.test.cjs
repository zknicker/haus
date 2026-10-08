'use strict';

const { describe, expect, test } = require('bun:test');
const builderConfig = require('../electron-builder.config.cjs');
const { isProviderAppDeeplink } = require('./provider-app-deeplinks.cjs');

describe('provider app deeplinks', () => {
    test('allows the Cursor background-agent deeplink', () => {
        expect(
            isProviderAppDeeplink('cursor://anysphere.cursor-deeplink/background-agent?bcId=bc-123')
        ).toBe(true);
    });

    test('rejects other Cursor paths, hosts, and schemes', () => {
        expect(isProviderAppDeeplink('cursor://anysphere.cursor-deeplink/mcp/install?x=1')).toBe(
            false
        );
        expect(isProviderAppDeeplink('cursor://file/etc/passwd')).toBe(false);
        expect(isProviderAppDeeplink('cursor://evil.example/background-agent?bcId=1')).toBe(false);
        expect(
            isProviderAppDeeplink('vscode://anysphere.cursor-deeplink/background-agent?bcId=1')
        ).toBe(false);
        expect(
            isProviderAppDeeplink('cursor://user@anysphere.cursor-deeplink/background-agent')
        ).toBe(false);
        expect(isProviderAppDeeplink('https://cursor.com/agents/bc-123')).toBe(false);
        expect(isProviderAppDeeplink('not a url')).toBe(false);
        expect(isProviderAppDeeplink(undefined)).toBe(false);
    });

    test('ships with the packaged desktop app', () => {
        expect(builderConfig.files).toContain('electron/provider-app-deeplinks.cjs');
    });
});
