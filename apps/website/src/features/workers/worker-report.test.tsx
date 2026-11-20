import { expect, test } from 'bun:test';
import { linkedMessage } from '../../../../../packages/haus-api/src/worker-fixture.ts';
import { askReport, renderCard } from './worker-card.test-utils.tsx';
import { workerTurnFixture as turn, workerFixture as work } from './worker-fixture.ts';

test('a needs-you report shows its text and the ask with its person, and invites an answer', () => {
    const html = renderCard(
        work({
            turns: [
                turn({
                    outcome: { kind: 'report', report: askReport },
                    status: 'pending_input',
                }),
            ],
        })
    );

    expect(html).toContain('Fixed five of six.');
    expect(html).toContain('@Zach ');
    expect(html).toContain('Does the iPad baseline move 2px on purpose?');
    expect(html).toContain('placeholder="Answer this Worker"');
    expect(html).toContain('aria-label="Send follow-up"');
    expect(html).not.toContain('worker-status-line');
});

test('a cited Drive file opens at the revision the report cited', () => {
    const report = { ...askReport, messageId: 'msg_report' };
    const html = renderCard(
        work({
            turns: [turn({ outcome: { kind: 'report', report }, status: 'pending_input' })],
        }),
        {
            ...linkedMessage,
            driveCitations: [
                {
                    artifactId: 'art_render',
                    path: 'agents/forge/renders/ENG-41/composer.png',
                    revisionId: 'rev_two',
                },
                {
                    artifactId: null,
                    path: 'agents/forge/reports/ENG-41/notes.md',
                    revisionId: null,
                },
            ],
            id: 'msg_report',
        }
    );

    expect(html).toContain('href="/s/cards/artifacts/art_render?revision=rev_two"');
    expect(html).toContain('composer.png');
    expect(html).toContain('notes.md');
});

test('on a narrow pane the card in the Task transcript still shows cited files', () => {
    const report = { ...askReport, messageId: 'msg_report' };
    const html = renderCard(
        work({ turns: [turn({ outcome: { kind: 'report', report }, status: 'pending_input' })] }),
        {
            ...linkedMessage,
            driveCitations: [
                { artifactId: 'art_render', path: 'a/render.png', revisionId: 'rev_two' },
            ],
            id: 'msg_report',
        },
        { inTranscript: true }
    );

    expect(html).toContain('render.png');
});

test('a Worker on a chatless legacy Task shows its summary and no composer', () => {
    const html = renderCard(
        work({ turns: [turn({ status: 'completed', summary: 'Opened PR #4.' })] }),
        undefined,
        { chatId: null }
    );

    expect(html).toContain('Opened PR #4.');
    expect(html).not.toContain('prompt-input');
});

test('the report reads at the card size and its ask can be selected', () => {
    const html = renderCard(
        work({
            turns: [
                turn({ outcome: { kind: 'report', report: askReport }, status: 'pending_input' }),
            ],
        })
    );

    expect(html).not.toContain('chat-markdown text-base');
    expect(html).toMatch(
        /data-testid="worker-report-ask"[^>]*data-selectable-text=""|data-selectable-text=""[^>]*data-testid="worker-report-ask"/u
    );
});
