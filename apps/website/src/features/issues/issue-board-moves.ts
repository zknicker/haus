import type { Issue, IssueState } from '@haus/api';
import { issueStateRef } from './issue-state.ts';

export interface IssueMove {
    state: IssueState;
}

export type IssueMoves = ReadonlyMap<string, IssueMove>;

export function startMove(moves: IssueMoves, issueId: string, move: IssueMove) {
    return new Map(moves).set(issueId, move);
}

export function settleMove(moves: IssueMoves, issueId: string, move: IssueMove) {
    if (moves.get(issueId) !== move) {
        return moves;
    }
    const next = new Map(moves);
    next.delete(issueId);
    return next;
}

export function withMoves(issues: readonly Issue[], moves: IssueMoves) {
    return issues.map((issue) => {
        const state = moves.get(issue.id)?.state;
        return state ? { ...issue, state: issueStateRef(state) } : issue;
    });
}
