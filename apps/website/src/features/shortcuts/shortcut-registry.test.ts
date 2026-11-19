import { expect, test } from 'bun:test';
import { createRequire } from 'node:module';
import {
    shouldInsertChatComposerLineBreak,
    shouldSubmitChatComposerKey,
} from '../chats/chat-composer-keyboard.ts';
import { unreadTriageCommand } from '../servers/inbox/use-unread-triage-keys.ts';
import { isCommandMenuKey } from '../shell/command-menu-key.ts';
import {
    type KeyChord,
    type ShortcutContext,
    type ShortcutModifier,
    shortcutRegistry,
    visibleShortcuts,
} from './shortcut-registry.ts';

interface MenuItem {
    accelerator?: string;
    id?: string;
    submenu?: MenuItem[];
    visible?: boolean;
}

interface PageInput {
    alt: boolean;
    code: string;
    control: boolean;
    key: string;
    meta: boolean;
    shift: boolean;
    type: 'keyDown';
}

const require = createRequire(import.meta.url);
const { appMenuTemplate } = require('../../../electron/app-menu.cjs') as {
    appMenuTemplate: (options: Record<string, unknown>) => MenuItem[];
};
const { browserShortcut } = require('../../../electron/browser-shortcuts.cjs') as {
    browserShortcut: (input: PageInput, platform: string) => string | null;
};

const menuChords = new Map(menuItems().map((item) => [item.chord, item.id]));

const handlersByContext: Record<ShortcutContext, (chord: KeyChord) => (string | null)[]> = {
    Anywhere: (chord) => [commandMenuId(chord)],
    Composer: (chord) => [composerId(chord)],
    'Desktop app': (chord) => [menuChords.get(chordId(chord)) ?? null, pageId(chord)],
    Inbox: (chord) => [inboxId(chord)],
    'Web page': (chord) => [menuChords.get(chordId(chord)) ?? null, pageId(chord)],
};

test('every listed chord runs its own command, and nothing else, where it applies', () => {
    for (const shortcut of shortcutRegistry) {
        for (const chord of shortcut.chords.flatMap(expandRange)) {
            const answers = handlersByContext[shortcut.context](chord).filter(
                (answer) => answer !== null
            );
            const where = `${shortcut.command} ${chordId(chord)}`;
            expect({ where, answers: [...new Set(answers)] }).toEqual({
                where,
                answers: [shortcut.id],
            });
        }
    }
});

test('every App menu accelerator is listed', () => {
    expect(missing(menuItems().map((item) => `${item.id} ${item.chord}`))).toEqual([]);
});

test('every key a desktop tab or web page answers is listed', () => {
    const answered = sweep().flatMap((chord) => {
        const id = pageId(chord);
        return id && !isAlias(chord, id) ? [`${id} ${chordId(chord)}`] : [];
    });
    expect(missing(answered)).toEqual([]);
});

test('every Inbox key is listed', () => {
    const answered = sweep()
        .filter((chord) => chord.modifiers.length === 0)
        .flatMap((chord) => {
            const id = inboxId(chord);
            return id ? [`${id} ${chordId(chord)}`] : [];
        });
    expect(missing(answered)).toEqual([]);
});

test('the web shows only shortcuts that work outside the desktop App', () => {
    expect(
        new Set(visibleShortcuts({ desktop: false, query: '' }).map((row) => row.context))
    ).toEqual(new Set(['Anywhere', 'Composer', 'Inbox']));
    expect(visibleShortcuts({ desktop: true, query: '' })).toHaveLength(shortcutRegistry.length);
});

test('search matches a command or where it applies', () => {
    expect(visibleShortcuts({ desktop: true, query: 'zoom' }).map((row) => row.id)).toEqual([
        'zoom-in',
        'zoom-out',
    ]);
    expect(visibleShortcuts({ desktop: false, query: 'inbox' }).map((row) => row.id)).toEqual([
        'inbox-next',
        'inbox-previous',
        'inbox-mark-read',
        'inbox-reply',
        'inbox-open',
    ]);
});

function missing(answered: string[]) {
    const listed = new Set(
        shortcutRegistry.flatMap((shortcut) =>
            shortcut.chords.flatMap(expandRange).map((chord) => `${shortcut.id} ${chordId(chord)}`)
        )
    );
    return [...new Set(answered)].filter((entry) => !listed.has(entry));
}

function menuItems() {
    const template = appMenuTemplate({
        actions: {},
        appName: 'Haus',
        platform: 'darwin',
        state: {},
    });
    return flatten(template).flatMap((item) =>
        item.accelerator && item.visible !== false && item.id
            ? [{ chord: chordId(fromAccelerator(item.accelerator)), id: item.id }]
            : []
    );
}

function flatten(items: MenuItem[]) {
    return items.flatMap((item) => [item, ...(item.submenu ?? [])]);
}

function fromAccelerator(accelerator: string) {
    const parts = accelerator.split('+');
    const modifierNames: Record<string, ShortcutModifier> = {
        Alt: 'option',
        Cmd: 'command',
        CmdOrCtrl: 'command',
        Ctrl: 'ctrl',
        Shift: 'shift',
    };
    const last = parts.at(-1) ?? '';
    return {
        key: ['Left', 'Right'].includes(last) ? last.toLowerCase() : last,
        modifiers: parts.slice(0, -1).map((part) => modifierNames[part] ?? 'command'),
    } satisfies KeyChord;
}

function pageId(chord: KeyChord) {
    const action = browserShortcut(pageInput(chord), 'darwin');
    if (!action?.startsWith('tab-')) {
        return action;
    }
    return action === 'tab-9' ? 'last-tab' : 'tab-number';
}

function inboxId(chord: KeyChord) {
    if (chord.modifiers.length > 0) {
        return null;
    }
    const command = unreadTriageCommand(eventKey(chord), false);
    return command ? `inbox-${command}` : null;
}

function composerId(chord: KeyChord) {
    const event = {
        ctrlKey: chord.modifiers.includes('ctrl'),
        key: eventKey(chord),
        metaKey: chord.modifiers.includes('command'),
        shiftKey: chord.modifiers.includes('shift'),
    };
    if (shouldSubmitChatComposerKey(event)) {
        return 'send';
    }
    return shouldInsertChatComposerLineBreak(event) ? 'line-break' : null;
}

function commandMenuId(chord: KeyChord) {
    return isCommandMenuKey({
        ctrlKey: chord.modifiers.includes('ctrl'),
        key: eventKey(chord),
        metaKey: chord.modifiers.includes('command'),
    })
        ? 'command-menu'
        : null;
}

function pageInput(chord: KeyChord) {
    const shift = chord.modifiers.includes('shift');
    const pressed = eventKey(chord);
    return {
        alt: chord.modifiers.includes('option'),
        code: keyCodes[chord.key] ?? `Key${chord.key}`,
        control: chord.modifiers.includes('ctrl'),
        key: shift || pressed.length > 1 ? pressed : pressed.toLowerCase(),
        meta: chord.modifiers.includes('command'),
        shift,
        type: 'keyDown',
    } satisfies PageInput;
}

function eventKey(chord: KeyChord) {
    return namedKeys[chord.key] ?? chord.key;
}

function isAlias(chord: KeyChord, id: string) {
    const zoom = id.startsWith('zoom-') && chord.modifiers.includes('shift');
    const tabWithCommand = chord.key === 'tab' && chord.modifiers.includes('command');
    return zoom || tabWithCommand;
}

function sweep() {
    const keys = [
        ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split(''),
        ...['=', '-', '[', ']', ',', 'enter', 'escape', 'left', 'right', 'tab'],
    ];
    const modifierSets: ShortcutModifier[][] = [];
    for (let flags = 0; flags < 16; flags++) {
        const all: ShortcutModifier[] = ['command', 'ctrl', 'shift', 'option'];
        modifierSets.push(all.filter((_, bit) => flags & (1 << bit)));
    }
    return keys.flatMap((key) => modifierSets.map((modifiers) => ({ key, modifiers })));
}

function expandRange(chord: KeyChord) {
    const range = /^(\d)–(\d)$/.exec(chord.key);
    if (!range) {
        return [chord] satisfies KeyChord[];
    }
    const [from, to] = [Number(range[1]), Number(range[2])];
    return Array.from({ length: to - from + 1 }, (_, offset) => ({
        ...chord,
        key: String(from + offset),
    }));
}

function chordId(chord: KeyChord) {
    return [...[...chord.modifiers].sort(), chord.key].join('+');
}

const namedKeys: Record<string, string> = {
    enter: 'Enter',
    escape: 'Escape',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    tab: 'Tab',
};

const keyCodes: Record<string, string> = {
    ',': 'Comma',
    '-': 'Minus',
    '=': 'Equal',
    '[': 'BracketLeft',
    ']': 'BracketRight',
    enter: 'Enter',
    escape: 'Escape',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    tab: 'Tab',
    ...Object.fromEntries('0123456789'.split('').map((digit) => [digit, `Digit${digit}`])),
};
