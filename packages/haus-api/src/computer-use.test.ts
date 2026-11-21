import { describe, expect, test } from 'bun:test';
import { desktopCommandClass } from './computer-use.ts';

describe('desktopCommandClass', () => {
    test('looking at the screen is look', () => {
        expect(desktopCommandClass(['snapshot', '--app', 'Finder', '-i'])).toBe('look');
        expect(desktopCommandClass(['screenshot', '--app', 'Finder'])).toBe('look');
        expect(desktopCommandClass(['skills', 'get', 'desktop'])).toBe('look');
    });

    test('clicking, typing, launching and the clipboard are act', () => {
        expect(desktopCommandClass(['click', '@s8f3k2p9:e8'])).toBe('act');
        expect(desktopCommandClass(['type', '@s8f3k2p9:e2', 'hello'])).toBe('act');
        expect(desktopCommandClass(['launch', 'TextEdit'])).toBe('act');
        expect(desktopCommandClass(['clipboard-get'])).toBe('act');
        expect(desktopCommandClass(['mouse-click', '--headed', '10', '20'])).toBe('act');
    });

    test('session, batch, held input and unknown commands are refused', () => {
        expect(desktopCommandClass(['batch', '[]'])).toBe('refused');
        expect(desktopCommandClass(['session', 'start'])).toBe('refused');
        expect(desktopCommandClass(['key-down', 'cmd'])).toBe('refused');
        expect(desktopCommandClass(['permissions', '--guide'])).toBe('refused');
        expect(desktopCommandClass(['rm', '-rf'])).toBe('refused');
    });

    test('identity, trace, stdin and headed looks are refused', () => {
        expect(desktopCommandClass(['click', '@s1:e1', '--session', 'x'])).toBe('refused');
        expect(desktopCommandClass(['click', '@s1:e1', '--agent-id=other'])).toBe('refused');
        expect(desktopCommandClass(['type', '@s1:e1', '--stdin'])).toBe('refused');
        expect(desktopCommandClass(['snapshot', '--trace-dir', '/tmp'])).toBe('refused');
        expect(desktopCommandClass(['snapshot', '--headed'])).toBe('refused');
    });
});
