import { expect, test } from 'bun:test';
import type { CrewFinish } from '@haus/api';
import { composeCrewFinishInput, formatCrewFinishesNotice } from './inbox-crew-finish-format.ts';
import { composeInboxNotice } from './inbox-format.ts';

const finish: CrewFinish = {
    ending: 'finished',
    id: 'crew-finish:tsk_1:run_1',
    issueCodes: ['GEN-12'],
    taskShortId: 'k3mq7xta',
    title: 'Rotate the signing key',
};

test('crew finishes name each Task and how its turn ended, then the guidance', () => {
    expect(
        composeCrewFinishInput([
            finish,
            {
                ending: 'waiting',
                id: 'crew-finish:tsk_2:run_2',
                issueCodes: [],
                taskShortId: 'p2r8ndvw',
                title: 'Audit the\ncopy',
            },
        ])
    ).toBe(
        [
            '2 crew Tasks ended a turn:',
            '[Haus crew task:k3mq7xta GEN-12 finished] Rotate the signing key',
            '[Haus crew task:p2r8ndvw waiting] Audit the copy',
            '',
            "A Task's chat holds what it did and said: `haus message read --target task:<id> --unread` reads what is new there. A waiting Task asked someone in its chat, and their answer wakes it. The person who asked you for the work hears from you, where they asked, when it is done or something needs them; people who talk to a Task in its chat already see its answers there. `haus task send <id>` answers a Task.",
        ].join('\n')
    );
});

test('a busy Captain hears only a count of crew turns that ended', () => {
    expect(formatCrewFinishesNotice(1)).toBe('1 crew Task ended a turn');
    expect(composeInboxNotice([], 0, { crewFinishes: { ids: ['a', 'b'], total: 2 } })).toContain(
        '2 crew Tasks ended a turn'
    );
});
