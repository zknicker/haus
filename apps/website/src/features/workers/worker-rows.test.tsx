import { expect, test } from 'bun:test';
import type { WorkerTurnInput } from '@haus/api';
import { workerTurnFixture as turn, workerFixture as work } from './worker-fixture.ts';
import { WorkerRows } from './worker-rows.tsx';
import { askReport, renderWorkerSurface } from './worker.test-utils.tsx';

const followUp: WorkerTurnInput = {
    at: '2026-09-04T12:02:00.000Z',
    author: { id: 'usr_zach', kind: 'user' },
    kind: 'follow-up',
    messageId: null,
    text: 'Match iPhone.',
};

test('a row is a status glyph and title, then place and age, with no composer or report text', () => {
    const html = renderWorkerSurface(
        <WorkerRows
            label="Workers"
            works={[
                work({
                    id: 'wkr_one',
                    turns: [
                        turn({
                            outcome: {
                                kind: 'report',
                                report: {
                                    ...askReport,
                                    ask: null,
                                    outcome: 'done',
                                    pullRequestUrls: ['https://github.com/haus/haus/pull/7'],
                                },
                            },
                        }),
                    ],
                }),
            ]}
        />
    );

    expect(html).toContain('Fix the failing migration');
    expect(html).toContain('aria-label="Done"');
    expect(html).toContain('Cursor · ');
    expect(html).not.toContain('Fixed five of six.');
    expect(html).not.toContain('prompt-input');
    expect(html).not.toContain('disclosure');
    expect(html).not.toContain('Open full log');
});

test('a needs-you row puts its question on a second line', () => {
    const html = renderWorkerSurface(
        <WorkerRows
            label="Workers"
            works={[
                work({
                    turns: [
                        turn({
                            outcome: { kind: 'report', report: askReport },
                            status: 'pending_input',
                        }),
                    ],
                }),
            ]}
        />
    );

    expect(html).toContain('aria-label="Needs you"');
    expect(html).toContain('Does the iPad baseline move 2px on purpose?');
});

test('a follow-up waiting behind a working turn reads Working, not Queued', () => {
    const html = renderWorkerSurface(
        <WorkerRows
            label="Workers"
            works={[
                work({
                    turns: [
                        turn({ input: [followUp], status: 'queued', turnId: 'wkt_two' }),
                        turn({ status: 'running', turnId: 'wkt_one' }),
                    ],
                }),
            ]}
        />
    );

    expect(html).toContain('aria-label="Working"');
    expect(html).not.toContain('Queued');
});
