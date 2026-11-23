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

export function workerNoAccessText(computer: ComputerFacts, appOrigin: string | null) {
    const person = computer.attacherHandle
        ? `@${computer.attacherHandle}`
        : `the person who attached ${computer.name}`;
    const link = appOrigin ? ` (${computerSettingsLink(appOrigin, computer)})` : '';
    return `You don't have access to ${computer.name}, so no Worker started there. Only ${person} can give you access, in Settings → Devices → ${computer.name}${link}. Ask them once in plain text, or start the Worker on another place.`;
}

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
    'no-access': 'you didn’t have access to that Computer',
    'no-session': 'nobody was logged in to that Computer’s screen',
    'not-listed': 'computer use there wasn’t allowed for you',
    'not-mac': 'that Computer isn’t a Mac',
    'not-ready': 'macOS hadn’t given Haus Computer its permissions there',
    'switched-out': 'another macOS user was using that Computer’s screen',
    locked: 'that Computer’s screen was locked',
    off: 'computer use was off there',
    offline: 'that Computer was offline',
} as const satisfies Record<Exclude<InvocationRefusal, 'not-found'>, string>;
