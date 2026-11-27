import { expect, test } from 'bun:test';
import type { CrewReportAttention } from '@haus/api';
import { composeCrewReportInput, formatCrewReportsNotice } from './inbox-crew-report-format.ts';
import { composeInboxNotice } from './inbox-format.ts';

const report: CrewReportAttention = {
    ask: null,
    id: 'crew-report:tsk_1:run_1',
    issueCodes: ['GEN-12'],
    issueEdits: [{ change: 'state todo → in_progress', code: 'GEN-12' }],
    outcome: 'done',
    person: null,
    pullRequests: [],
    taskShortId: 'k3mq7xta',
    title: 'Rotate the signing key',
    text: 'Rotated the key.\nThe deploy secret is updated.',
};

test('crew reports render one head per Task with the text, edits and guidance', () => {
    expect(
        composeCrewReportInput([
            report,
            {
                ...report,
                id: 'crew-report:tsk_2:run_2',
                issueCodes: [],
                issueEdits: [],
                outcome: 'unreported',
                taskShortId: 'p2r8ndvw',
                text: 'Halfway there.',
                title: 'Audit the copy',
            },
        ])
    ).toBe(
        [
            '2 crew reports:',
            '[Haus crew report task:k3mq7xta outcome=done GEN-12] Rotate the signing key',
            '> Rotated the key.\n> The deploy secret is updated.',
            'Issue: GEN-12 state todo → in_progress',
            '[Haus crew report task:p2r8ndvw outcome=unreported] Audit the copy',
            'It ended a turn you directed without a report. Its last message:',
            '> Halfway there.',
            '',
            "Each report is also posted in its Task's chat. The person who asked you for the work hears from you only in what you write to them, where they asked. Answer a Task with `haus task send <id>`, or move its Issue on with `haus issue update`.",
        ].join('\n')
    );
});

test('a busy Captain hears only a count of queued crew reports', () => {
    expect(formatCrewReportsNotice(1)).toBe('1 crew report');
    expect(composeInboxNotice([], 0, { crewReports: { ids: ['a', 'b'], total: 2 } })).toContain(
        '2 crew reports'
    );
});
