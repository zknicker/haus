export type ShortcutModifier = 'command' | 'ctrl' | 'option' | 'shift';

export interface KeyChord {
    readonly key: string;
    readonly modifiers: readonly ShortcutModifier[];
}

export type ShortcutContext = 'Anywhere' | 'Composer' | 'Desktop app' | 'Inbox' | 'Web page';

export interface Shortcut {
    readonly chords: readonly KeyChord[];
    readonly command: string;
    readonly context: ShortcutContext;
    readonly id: string;
}

export const shortcutRegistry = [
    row('command-menu', 'Open command menu', 'Anywhere', [cmd('K')]),
    row('send', 'Send message', 'Composer', [key('enter')]),
    row('line-break', 'New line', 'Composer', [key('enter', 'shift')]),
    row('inbox-next', 'Next card', 'Inbox', [key('J')]),
    row('inbox-previous', 'Previous card', 'Inbox', [key('K')]),
    row('inbox-mark-read', 'Mark read', 'Inbox', [key('E')]),
    row('inbox-reply', 'Reply', 'Inbox', [key('R')]),
    row('inbox-open', 'Open conversation', 'Inbox', [key('enter')]),
    row('settings', 'Open Settings', 'Desktop app', [cmd(',')]),
    row('new-window', 'New window', 'Desktop app', [cmd('N')]),
    row('new-tab', 'New tab', 'Desktop app', [cmd('T')]),
    row('reopen-tab', 'Reopen closed tab', 'Desktop app', [cmd('T', 'shift')]),
    row('close-tab', 'Close tab', 'Desktop app', [cmd('W')]),
    row('close-window', 'Close window', 'Desktop app', [cmd('W', 'shift')]),
    row('next-tab', 'Next tab', 'Desktop app', [
        key('tab', 'ctrl'),
        cmd(']', 'shift'),
        cmd('right', 'option'),
    ]),
    row('previous-tab', 'Previous tab', 'Desktop app', [
        key('tab', 'ctrl', 'shift'),
        cmd('[', 'shift'),
        cmd('left', 'option'),
    ]),
    row('tab-number', 'Go to tab 1 to 8', 'Desktop app', [cmd('1–8')]),
    row('last-tab', 'Go to last tab', 'Desktop app', [cmd('9')]),
    row('back', 'Back', 'Desktop app', [cmd('[')]),
    row('forward', 'Forward', 'Desktop app', [cmd(']')]),
    row('find', 'Find', 'Desktop app', [cmd('F')]),
    row('reload', 'Reload page', 'Desktop app', [cmd('R')]),
    row('toggle-sidebar', 'Show or hide sidebar', 'Desktop app', [cmd('S', 'ctrl')]),
    row('zoom-in', 'Zoom in', 'Desktop app', [cmd('=')]),
    row('zoom-out', 'Zoom out', 'Desktop app', [cmd('-')]),
    row('zoom-reset', 'Actual size', 'Desktop app', [cmd('0')]),
    row('open-devtools', 'Open Web Inspector', 'Desktop app', [cmd('I', 'option')]),
    row('toggle-dev-mode', 'Toggle dev mode', 'Desktop app', [cmd('D', 'option')]),
    row('address', 'Edit address', 'Web page', [cmd('L')]),
    row('find-next', 'Find next', 'Web page', [cmd('G')]),
    row('find-previous', 'Find previous', 'Web page', [cmd('G', 'shift')]),
    row('hard-reload', 'Reload, ignoring cache', 'Web page', [cmd('R', 'shift')]),
    row('stop', 'Stop loading', 'Web page', [key('escape')]),
] satisfies readonly Shortcut[];

export function matchingShortcuts(query: string) {
    const needle = query.trim().toLowerCase();
    return shortcutRegistry.filter(
        (shortcut) =>
            needle.length === 0 ||
            shortcut.command.toLowerCase().includes(needle) ||
            shortcut.context.toLowerCase().includes(needle)
    );
}

function row(id: string, command: string, context: ShortcutContext, chords: readonly KeyChord[]) {
    return { chords, command, context, id } satisfies Shortcut;
}

function cmd(chordKey: string, ...modifiers: ShortcutModifier[]) {
    return { key: chordKey, modifiers: ['command', ...modifiers] } satisfies KeyChord;
}

function key(chordKey: string, ...modifiers: ShortcutModifier[]) {
    return { key: chordKey, modifiers } satisfies KeyChord;
}
