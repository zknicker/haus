import { expect, test } from 'bun:test';
import { linkedMessage } from '../../../../../packages/haus-api/src/worker-fixture.ts';
import { WorkerReport } from './worker-report.tsx';
import { askReport, renderWorkerSurface, server } from './worker.test-utils.tsx';

test('a report shows its text and its ask with the person it names, selectable and at card size', () => {
    const html = renderWorkerSurface(
        <WorkerReport chatId={null} report={askReport} server={server} />
    );

    expect(html).toContain('Fixed five of six.');
    expect(html).toContain('@Zach ');
    expect(html).not.toContain('chat-markdown text-base');
    expect(html).toMatch(
        /data-selectable-text=""[^>]*data-testid="worker-report-ask"|data-testid="worker-report-ask"[^>]*data-selectable-text=""/u
    );
});

test('a cited Drive file opens at the revision the report cited', () => {
    const html = renderWorkerSurface(
        <WorkerReport
            chatId="cht_task"
            report={{ ...askReport, messageId: 'msg_report' }}
            server={server}
        />,
        {
            messages: [
                {
                    ...linkedMessage,
                    chatId: 'cht_task',
                    driveCitations: [
                        {
                            artifactId: 'art_render',
                            path: 'renders/composer.png',
                            revisionId: 'rev_two',
                        },
                        { artifactId: null, path: 'reports/notes.md', revisionId: null },
                    ],
                    id: 'msg_report',
                },
            ],
        }
    );

    expect(html).toContain('href="/s/cards/artifacts/art_render?revision=rev_two"');
    expect(html).toContain('composer.png');
    expect(html).toContain('notes.md');
});
