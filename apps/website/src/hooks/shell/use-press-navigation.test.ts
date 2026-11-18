import { expect, test } from 'bun:test';
import { bindPressNavigation, isPlainPrimaryPress } from './use-press-navigation.ts';

const plain = {
    altKey: false,
    button: 0,
    ctrlKey: false,
    defaultPrevented: false,
    isPrimary: true,
    metaKey: false,
    pointerType: 'mouse',
    shiftKey: false,
};

test('only an unmodified primary mouse press navigates early', () => {
    expect(isPlainPrimaryPress(plain)).toBe(true);
    // New-tab gestures (ADR 0039), right-click, and touch keep their click path.
    expect(isPlainPrimaryPress({ ...plain, metaKey: true })).toBe(false);
    expect(isPlainPrimaryPress({ ...plain, ctrlKey: true })).toBe(false);
    expect(isPlainPrimaryPress({ ...plain, shiftKey: true })).toBe(false);
    expect(isPlainPrimaryPress({ ...plain, altKey: true })).toBe(false);
    expect(isPlainPrimaryPress({ ...plain, button: 1 })).toBe(false);
    expect(isPlainPrimaryPress({ ...plain, button: 2 })).toBe(false);
    expect(isPlainPrimaryPress({ ...plain, pointerType: 'touch' })).toBe(false);
    expect(isPlainPrimaryPress({ ...plain, defaultPrevented: true })).toBe(false);
});

test('a press navigates once: its own click is swallowed, a keyboard click is not', () => {
    const bound = boundElement();
    const { element, navigations } = bound;

    element.dispatchEvent(gesture('pointerdown', plain));
    expect(navigations).toEqual(['/s/haus/c/chat_one']);
    expect(bound.preloads).toBe(1);

    const pressClick = gesture('click', { detail: 1 });
    element.dispatchEvent(pressClick);
    expect(pressClick.defaultPrevented).toBe(true);

    const keyboardClick = gesture('click', { detail: 0 });
    element.dispatchEvent(keyboardClick);
    expect(keyboardClick.defaultPrevented).toBe(false);
    expect(navigations).toHaveLength(1);
});

test('a modified press leaves its click to the link', () => {
    const { element, navigations } = boundElement();

    element.dispatchEvent(gesture('pointerdown', { ...plain, metaKey: true }));
    const click = gesture('click', { detail: 1, metaKey: true });
    element.dispatchEvent(click);

    expect(navigations).toEqual([]);
    expect(click.defaultPrevented).toBe(false);
});

test('a press that ended elsewhere (a drag) does not swallow a later click', () => {
    const { element, navigations } = boundElement();

    element.dispatchEvent(gesture('pointerdown', plain));
    element.dispatchEvent(gesture('pointerdown', { ...plain, button: 2 }));
    const click = gesture('click', { detail: 1 });
    element.dispatchEvent(click);

    expect(navigations).toHaveLength(1);
    expect(click.defaultPrevented).toBe(false);
});

test('a draggable row opens on press, and dragging it to reorder never opens it again', () => {
    const at = (x: number, y: number) => ({ ...plain, clientX: x, clientY: y });
    const { element, navigations } = boundElement();

    // Like a Chrome tab, the press opens the row before any drag can start.
    element.dispatchEvent(gesture('pointerdown', at(10, 10)));
    expect(navigations).toEqual(['/s/haus/c/chat_one']);

    // The drag that follows, and a drop that lands back on the row, add nothing.
    element.dispatchEvent(gesture('pointermove', at(10, 18)));
    element.dispatchEvent(gesture('pointermove', at(10, 11)));
    element.dispatchEvent(gesture('pointerup', at(10, 11)));
    const dropClick = gesture('click', { detail: 1 });
    element.dispatchEvent(dropClick);
    expect(dropClick.defaultPrevented).toBe(true);
    expect(navigations).toHaveLength(1);
});

function boundElement() {
    const element = new EventTarget();
    const navigations: string[] = [];
    let preloads = 0;
    const latest = {
        current: {
            href: '/s/haus/c/chat_one',
            navigate: (href: string, options?: { flushSync?: boolean }) => {
                // A transition would leave the old page up for frames (React Router's default).
                expect(options?.flushSync).toBe(true);
                navigations.push(href);
            },
            onPress: () => {
                preloads += 1;
            },
        },
    };
    bindPressNavigation(element, latest, { current: false });
    return {
        element,
        navigations,
        get preloads() {
            return preloads;
        },
    };
}

function gesture(type: string, fields: Record<string, unknown>) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    for (const [key, value] of Object.entries(fields)) {
        if (key !== 'defaultPrevented') {
            Object.defineProperty(event, key, { value });
        }
    }
    return event;
}
