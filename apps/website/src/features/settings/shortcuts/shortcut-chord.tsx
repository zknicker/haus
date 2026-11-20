import { Kbd } from '@heroui/react';
import type { KeyChord, ShortcutModifier } from '../../shortcuts/shortcut-registry.ts';

export function ShortcutChords({ chords, isMac }: { chords: readonly KeyChord[]; isMac: boolean }) {
    return (
        <span className="flex flex-wrap items-center gap-1.5">
            {chords.map((chord) => (
                <ShortcutChord chord={chord} isMac={isMac} key={chordLabel(chord, isMac)} />
            ))}
        </span>
    );
}

export function ShortcutChord({ chord, isMac }: { chord: KeyChord; isMac: boolean }) {
    const modifiers = modifierOrder.filter((modifier) => chord.modifiers.includes(modifier));
    const arrow = arrowKeys.find((candidate) => candidate === chord.key);
    return (
        <Kbd aria-label={chordLabel(chord, isMac)}>
            {modifiers.map((modifier) =>
                isMac ? (
                    <Kbd.Abbr key={modifier} keyValue={modifier} />
                ) : (
                    <Kbd.Content key={modifier}>{otherModifierNames[modifier]}</Kbd.Content>
                )
            )}
            {arrow ? (
                <Kbd.Abbr keyValue={arrow} />
            ) : (
                <Kbd.Content>{keyNames[chord.key] ?? chord.key}</Kbd.Content>
            )}
        </Kbd>
    );
}

export function chordLabel(chord: KeyChord, isMac: boolean) {
    const names = isMac ? macModifierNames : otherModifierNames;
    const modifiers = modifierOrder
        .filter((modifier) => chord.modifiers.includes(modifier))
        .map((modifier) => names[modifier]);
    return [...modifiers, spokenKeys[chord.key] ?? keyNames[chord.key] ?? chord.key].join(' ');
}

const modifierOrder: readonly ShortcutModifier[] = ['ctrl', 'option', 'shift', 'command'];

const arrowKeys = ['left', 'right'] as const;

const macModifierNames: Record<ShortcutModifier, string> = {
    command: 'Command',
    ctrl: 'Control',
    option: 'Option',
    shift: 'Shift',
};

const otherModifierNames: Record<ShortcutModifier, string> = {
    command: 'Ctrl',
    ctrl: 'Ctrl',
    option: 'Alt',
    shift: 'Shift',
};

const keyNames: Record<string, string> = {
    enter: 'Return',
    escape: 'Esc',
    tab: 'Tab',
};

const spokenKeys: Record<string, string> = {
    left: 'Left Arrow',
    right: 'Right Arrow',
};
