import type { AgentTurn } from '@haus/api';
import type { TurnRowTitle } from './agent-turn-row-model.ts';

export function recentRowLine(input: {
    outcome: string;
    summary: string | null | undefined;
    title: TurnRowTitle;
}) {
    const summary = firstLine(input.summary);
    if (summary) {
        return { muted: false, text: summary };
    }
    if (input.title.kind === 'text') {
        return { muted: false, text: input.title.text };
    }
    if (input.title.kind === 'pending') {
        return { muted: false, text: '' };
    }
    return { muted: true, text: input.outcome };
}

export function turnSummaries(turns: readonly Pick<AgentTurn, 'runId' | 'summary'>[] | undefined) {
    return new Map((turns ?? []).map((turn) => [turn.runId, turn.summary]));
}

function firstLine(summary: string | null | undefined) {
    const line = summary
        ?.split('\n')
        .map((part) => part.trim())
        .find((part) => part.length > 0);
    return line ?? null;
}
