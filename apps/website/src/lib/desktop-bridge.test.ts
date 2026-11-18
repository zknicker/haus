import { describe, expect, test } from 'bun:test';
import { type HausDesktopBridge, resolveDesktopBridge } from './desktop-bridge.ts';

const current = { loadsApp: true } as unknown as HausDesktopBridge;

describe('desktop bridge discovery', () => {
    test('finds the bridge the Haus shell injects', () => {
        expect(resolveDesktopBridge({ hausDesktop: current })).toBe(current);
    });

    test('reports a plain browser as not the desktop app', () => {
        expect(resolveDesktopBridge({})).toBeNull();
        expect(resolveDesktopBridge(undefined)).toBeNull();
        expect(resolveDesktopBridge(null)).toBeNull();
    });
});
