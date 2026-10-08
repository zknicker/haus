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

test('a draggable row navigates on an unmoved release, never on a reorder drag', () => {
    const at = (x: number, y: number) => ({ ...plain, clientX: x, clientY: y });

    // A simple press on a row that is not the current Chat opens it on release.
    const press = boundElement('release');
    press.element.dispatchEvent(gesture('pointerdown', at(10, 10)));
    expect(press.navigations).toEqual([]);
    press.element.dispatchEvent(gesture('pointermove', at(11, 11)));
    press.element.dispatchEvent(gesture('pointerup', at(11, 11)));
    expect(press.navigations).toEqual(['/s/haus/c/chat_one']);
    expect(press.preloads).toBe(1);
    const pressClick = gesture('click', { detail: 1 });
    press.element.dispatchEvent(pressClick);
    expect(pressClick.defaultPrevented).toBe(true);

    // Dragging the row past the sensor's threshold to reorder it never opens it,
    // even when the drop lands back on the row and fires a click there.
    const drag = boundElement('release');
    drag.element.dispatchEvent(gesture('pointerdown', at(10, 10)));
    drag.element.dispatchEvent(gesture('pointermove', at(10, 18)));
    drag.element.dispatchEvent(gesture('pointermove', at(10, 11)));
    drag.element.dispatchEvent(gesture('pointerup', at(10, 11)));
    const dropClick = gesture('click', { detail: 1 });
    drag.element.dispatchEvent(dropClick);
    expect(drag.navigations).toEqual([]);
    expect(dropClick.defaultPrevented).toBe(true);

    // A pointer that left the row mid-press is a drag too.
    const left = boundElement('release');
    left.element.dispatchEvent(gesture('pointerdown', at(10, 10)));
    left.element.dispatchEvent(gesture('pointerleave', at(10, 12)));
    left.element.dispatchEvent(gesture('pointerup', at(10, 11)));
    expect(left.navigations).toEqual([]);
});

function boundElement(timing: 'press' | 'release' = 'press') {
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
            timing,
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
