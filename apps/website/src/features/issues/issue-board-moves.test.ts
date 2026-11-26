import { expect, test } from 'bun:test';
import type { Issue } from '@haus/api';
import { type IssueMove, settleMove, startMove, withMoves } from './issue-board-moves.ts';
import { issueStateRef } from './issue-state.ts';

test('an earlier move settling leaves a later move of the same Issue in place', () => {
    const first: IssueMove = { state: 'todo' };
    const second: IssueMove = { state: 'done' };
    const moves = startMove(startMove(new Map(), 'iss_a', first), 'iss_a', second);

    expect(settleMove(moves, 'iss_a', first).get('iss_a')).toBe(second);
    expect(settleMove(moves, 'iss_a', second).has('iss_a')).toBe(false);
});

test('each move settles on its own across Issues', () => {
    const a: IssueMove = { state: 'in_progress' };
    const b: IssueMove = { state: 'canceled' };
    const moves = startMove(startMove(new Map(), 'iss_a', a), 'iss_b', b);
    const settled = settleMove(moves, 'iss_a', a);

    expect([...settled.keys()]).toEqual(['iss_b']);
    const shown = withMoves(
        [
            { id: 'iss_a', state: issueStateRef('backlog') },
            { id: 'iss_b', state: issueStateRef('todo') },
        ] as unknown as Issue[],
        settled
    );
    expect(shown.map((issue) => issue.state)).toEqual([
        issueStateRef('backlog'),
        issueStateRef('canceled'),
    ]);
});
