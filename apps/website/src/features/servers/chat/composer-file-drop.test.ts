import { expect, test } from 'bun:test';
import {
    hasFileTransfer,
    installStrayFileDropGuard,
    ownsDropTarget,
} from './composer-file-drop.ts';

const chatSurface = {} as Element;
const innerSurface = {} as Element;
const targetIn = (surface: Element) => ({ closest: () => surface }) as unknown as EventTarget;

test('a drop belongs only to the nearest drop surface of its target', () => {
    expect(ownsDropTarget(targetIn(chatSurface), chatSurface)).toBe(true);
    expect(ownsDropTarget(targetIn(innerSurface), chatSurface)).toBe(false);
    expect(ownsDropTarget(targetIn(innerSurface), innerSurface)).toBe(true);
    expect(ownsDropTarget(null, chatSurface)).toBe(false);
});

test('only drags that carry files count as file drops', () => {
    expect(hasFileTransfer({ types: ['Files'] })).toBe(true);
    expect(hasFileTransfer({ types: ['text/plain', 'text/uri-list'] })).toBe(false);
    expect(hasFileTransfer(null)).toBe(false);
});

test('the stray-drop guard blocks unclaimed file drops and leaves the rest alone', () => {
    const listeners = new Map<string, (event: DragEvent) => void>();
    installStrayFileDropGuard({
        addEventListener: ((type: string, listener: (event: DragEvent) => void) => {
            listeners.set(type, listener);
        }) as Window['addEventListener'],
    });
    const dispatch = (type: string, types: string[], defaultPrevented = false) => {
        const event = {
            dataTransfer: { dropEffect: 'copy', types },
            defaultPrevented,
            preventDefault() {
                this.defaultPrevented = true;
            },
        };
        listeners.get(type)?.(event as unknown as DragEvent);
        return event;
    };

    const stray = dispatch('drop', ['Files']);
    expect(stray.defaultPrevented).toBe(true);
    expect(stray.dataTransfer.dropEffect).toBe('none');

    // A surface already claimed it: its copy cursor stays.
    const claimed = dispatch('dragover', ['Files'], true);
    expect(claimed.dataTransfer.dropEffect).toBe('copy');

    const textDrag = dispatch('dragover', ['text/plain']);
    expect(textDrag.defaultPrevented).toBe(false);
});
