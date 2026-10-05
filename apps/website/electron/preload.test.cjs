'use strict';

const { readFileSync } = require('node:fs');
const path = require('node:path');
const { describe, expect, test } = require('bun:test');
const { openerArguments } = require('./window-routing.cjs');

const preloadPath = path.join(__dirname, 'preload.cjs');

// `preload.cjs` only resolves `electron` inside the renderer sandbox, so it
// cannot be required directly. Run the real file with a stub `require` instead
// and record what it hands to `contextBridge`.
function exposeDesktopBridge() {
    const exposed = new Map();
    runPreload({
        contextBridge: {
            exposeInMainWorld: (name, value) => {
                exposed.set(name, value);
            },
        },
        ipcRenderer: { invoke: () => undefined, off: () => undefined, on: () => undefined },
    });
    return exposed;
}

function runPreload(electron) {
    const preloadModule = { exports: {} };
    const compiled = new Function(
        'require',
        'module',
        'exports',
        '__filename',
        '__dirname',
        readFileSync(preloadPath, 'utf8')
    );
    compiled(
        // `electron` is the only specifier that needs standing in for; this
        // test file sits beside preload.cjs, so anything else resolves the same
        // way it would in the shell.
        (specifier) => (specifier === 'electron' ? electron : require(specifier)),
        preloadModule,
        preloadModule.exports,
        preloadPath,
        __dirname
    );
}

describe('desktop preload bridge', () => {
    test('exposes only the supported Haus bridge global', () => {
        expect([...exposeDesktopBridge().keys()]).toEqual(['hausDesktop']);
    });

    test('the bridge carries the live desktop surface', () => {
        const bridge = exposeDesktopBridge().get('hausDesktop');

        expect(bridge.loadsApp).toBe(true);
        expect(typeof bridge.authTokenGet).toBe('function');
        expect(typeof bridge.authSessionPeek).toBe('function');
        expect(typeof bridge.authSessionShare).toBe('function');
        expect(typeof bridge.openExternal).toBe('function');
        expect(typeof bridge.browserCommand).toBe('function');
        expect(typeof bridge.browserSnapshot).toBe('function');
        expect(typeof bridge.browserLayout).toBe('function');
        expect(bridge.browserBounds).toBeUndefined();
        expect(typeof bridge.browserCapture).toBe('function');
        expect(typeof bridge.onBrowserState).toBe('function');
        expect(typeof bridge.onBrowserFocus).toBe('function');
        expect(typeof bridge.onBrowserOpenRequest).toBe('function');
        expect(bridge.onBrowserReveal).toBeUndefined();
        expect(typeof bridge.focusWindow).toBe('function');
        expect(typeof bridge.prepareSsoCallback).toBe('function');
        for (const name of ['tabDragClaim', 'tabDragDetach', 'tabDragEnd', 'tabDragStart']) {
            expect(typeof bridge[name]).toBe('function');
        }
        expect(typeof bridge.tabStripReport).toBe('function');
        expect(typeof bridge.onTabDrag).toBe('function');
    });

    test('openedFromWindow reflects the renderer argv main set for opened windows', () => {
        expect(exposeDesktopBridge().get('hausDesktop').openedFromWindow).toBe(false);
        const originalArgv = process.argv;
        process.argv = [...originalArgv, ...openerArguments({ opener: {} })];
        try {
            expect(exposeDesktopBridge().get('hausDesktop').openedFromWindow).toBe(true);
        } finally {
            process.argv = originalArgv;
        }
    });

    test('the window layout stays renderer-only: no bridge channel carries it', () => {
        const bridge = exposeDesktopBridge().get('hausDesktop');

        expect(bridge.setShellVariant).toBeUndefined();
        expect(bridge.onShellVariantSelect).toBeUndefined();
    });
});
