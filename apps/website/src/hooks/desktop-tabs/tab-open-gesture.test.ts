import { describe, expect, test } from 'bun:test';
import { currentOpenGesture, openIntentFromEvent, trackOpenGestures } from './tab-open-gesture.ts';

const mac = /Mac/u.test(navigator.platform);
const command = mac ? { metaKey: true } : { ctrlKey: true };
const plain = { button: 0, ctrlKey: false, metaKey: false, shiftKey: false };

describe('openIntentFromEvent', () => {
    test("Chrome's dispositions: Command- or middle-click opens a background tab", () => {
        expect(openIntentFromEvent({ ...plain, ...command })).toBe('backgroundTab');
        expect(openIntentFromEvent({ ...plain, button: 1 })).toBe('backgroundTab');
    });

    test('Shift selects the new tab: Command-Shift-, middle-Shift-, and Shift-click', () => {
        expect(openIntentFromEvent({ ...plain, ...command, shiftKey: true })).toBe('newTab');
        expect(openIntentFromEvent({ ...plain, button: 1, shiftKey: true })).toBe('newTab');
        // Shift alone is a selected new tab, not Chrome's new window.
        expect(openIntentFromEvent({ ...plain, shiftKey: true })).toBe('newTab');
    });

    test('a plain or secondary click, and no event, is a plain open', () => {
        expect(openIntentFromEvent(plain)).toBe('auto');
        expect(openIntentFromEvent({ ...plain, button: 2 })).toBe('auto');
        expect(openIntentFromEvent(null)).toBe('auto');
        // macOS Control-click is a secondary click; off macOS Command is not a modifier here.
        expect(
            openIntentFromEvent({ ...plain, ...(mac ? { ctrlKey: true } : { metaKey: true }) })
        ).toBe('auto');
    });
});

describe('trackOpenGestures', () => {
    test('reads the in-flight trusted click until its dispatch ends', async () => {
        const listeners = new Map<string, (event: Event) => void>();
        const uninstall = trackOpenGestures({
            addEventListener: (type: string, listener: (event: Event) => void) =>
                listeners.set(type, listener),
            removeEventListener: (type: string) => listeners.delete(type),
        } as unknown as Window);
        const dispatch = (type: string, init: object, isTrusted = true) =>
            listeners.get(type)?.({ ...plain, isTrusted, type, ...init } as unknown as Event);

        dispatch('auxclick', { button: 1 });
        expect(currentOpenGesture()).toBe('backgroundTab');
        // A relayed (synthetic) click keeps the user's gesture.
        dispatch('click', {}, false);
        expect(currentOpenGesture()).toBe('backgroundTab');
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(currentOpenGesture()).toBe('auto');

        dispatch('pointerup', { shiftKey: true });
        expect(currentOpenGesture()).toBe('newTab');
        uninstall();
        expect(currentOpenGesture()).toBe('auto');
        expect(listeners.size).toBe(0);
    });
});
