import type { ComputerUseDecision } from '@haus/api';

export function deviceLabel(name: string | null) {
    return name ?? 'this Device';
}

export function awaitingApprovalText(device: string) {
    return `This chat hasn't allowed computer use on ${device} yet. Haus asked in the chat. End your turn; an inbox item tells you when someone answers. Looking at the screen needs no approval.`;
}

export function noChatText(device: string) {
    return `Computer use on ${device} asks a person in a chat, and this turn has no chat to ask in.`;
}

export function decisionText(input: {
    decision: ComputerUseDecision;
    device: string;
    person: string;
}) {
    const { decision, device, person } = input;
    switch (decision) {
        case 'allow':
            return `${person} allowed computer use on ${device} in this chat. Next: run the desktop command again.`;
        case 'always':
            return `${person} always allowed computer use on ${device}. Next: run the desktop command again.`;
        case 'deny':
            return `${person} denied computer use on ${device} in this chat. Next: don't click or type there; say what you need, or go on without it.`;
        default:
            return decision satisfies never;
    }
}
