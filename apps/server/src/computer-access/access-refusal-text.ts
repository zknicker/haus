import type { InvocationRefusal } from '@haus/api';
import { type ComputerFacts, computerSettingsLink } from './computer-facts.ts';

const listHint = 'Run `haus computer list` to see the Computers you can use.';

export function notFoundText(candidates: readonly string[]) {
    if (candidates.length > 1) {
        return `More than one Computer has that name, so nothing ran: ${candidates.join(', ')}. Call again with one of these ids as \`computer\`; \`haus computer list\` shows which is which.`;
    }
    return 'No Computer on this Server matches that `computer`, so nothing ran. Run `haus computer list` to see each Computer’s id and name, or leave `computer` out to run on your Machine.';
}

export function noAccessText(computer: ComputerFacts, appOrigin: string) {
    const person = computer.attacherHandle
        ? `@${computer.attacherHandle}`
        : `the person who attached ${computer.name}`;
    const page = `Settings → Devices → ${computer.name} (${computerSettingsLink(appOrigin, computer)})`;
    return `You don't have access to ${computer.name}. Only ${person} can give you access, in ${page}. ${listHint}`;
}

export function movedText(machineName: string | null) {
    const now = machineName ? `Your Machine is now ${machineName}` : 'Your Machine changed';
    return `${now}, and this run started before that, so a call that names no Computer ran nothing. Your next turn runs on the new Machine. To reach a Computer now, name it with \`computer\`. ${listHint}`;
}

export const taskMachineOnlyText =
    'A Task works only on its own Machine, so nothing ran. Leave `computer` out to run there.';

export function computerOfflineText(name: string) {
    return `${name} is offline. Nothing ran. \`haus\` and \`execute\` still work, and \`haus computer list\` shows which Computers are online.`;
}

export function goneComputerText(refusal: InvocationRefusal) {
    if (refusal === 'not-found') {
        return notFoundText([]);
    }
    return `Nothing ran: ${gonePhrases[refusal]}. That Computer is no longer attached to this Server. ${listHint}`;
}

export function ranOnLine(name: string) {
    return `[Ran on ${name}]`;
}

const gonePhrases = {
    'desktop-busy': 'another session was using that Computer’s desktop',
    'no-access': 'you didn’t have access to that Computer',
    'task-machine-only': 'a Task works only on its own Machine',
    moved: 'your Machine changed after this run started',
    'no-session': 'nobody was logged in to that Computer’s screen',
    'not-listed': 'computer use there wasn’t allowed for you',
    'not-mac': 'that Computer isn’t a Mac',
    'not-ready': 'macOS hadn’t given Haus Computer its permissions there',
    'switched-out': 'another macOS user was using that Computer’s screen',
    locked: 'that Computer’s screen was locked',
    off: 'computer use was off there',
    offline: 'that Computer was offline',
} as const satisfies Record<Exclude<InvocationRefusal, 'not-found'>, string>;
