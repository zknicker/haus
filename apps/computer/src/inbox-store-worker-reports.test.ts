import { beforeEach, expect, test } from 'bun:test';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { noticeReceipt } from '@haus/api';
import { parseNoticeCommand } from './agent-command-frames.ts';
import { noticePath } from './delivery.ts';
import { acceptRunInbox, readPendingInboxState, replacePendingInbox } from './inbox-store.ts';
import { workerReportItem } from './worker-report.fixture.ts';

let dataRoot: string;
const location = () => ({ agentId: 'agt_reports', dataRoot, serverId: 'srv_reports' });
const storedNotice = () =>
    noticePath(dataRoot, { agentId: 'agt_reports', serverId: 'srv_reports' });
const workerReports = {
    ids: ['worker-report:wkt_one', 'worker-report:wkt_two'],
    taskKey: 'ENG-41',
    total: 2,
};

beforeEach(async () => {
    if (dataRoot) {
        await rm(dataRoot, { force: true, recursive: true });
    }
    dataRoot = await mkdtemp(join(tmpdir(), 'haus-inbox-reports-'));
});

test('a notice of one Task’s reports alone parses and acks the reports it names', () => {
    const notice = parseNoticeCommand({
        agentId: 'agt_reports',
        inbox: [],
        runId: 'run_busy',
        totalPending: 0,
        type: 'notice',
        workerReports,
    });
    expect(notice?.workerReports).toEqual(workerReports);
    expect(notice && noticeReceipt(notice)).toEqual({
        runId: 'run_busy',
        workIds: workerReports.ids,
    });
    expect(
        parseNoticeCommand({
            agentId: 'agt_reports',
            inbox: [],
            runId: 'run_busy',
            totalPending: 0,
            type: 'notice',
            workerReports: { ...workerReports, total: 1 },
        })
    ).toBeNull();
});

test('the count rides the busy notice until a run carries the reports', async () => {
    const delivered: string[] = [];
    const notice = await replacePendingInbox(
        location(),
        [],
        0,
        async (text) => {
            delivered.push(text);
        },
        { runId: 'run_busy', workIds: workerReports.ids },
        { workerReports }
    );
    expect(notice).toContain('2 Worker reports in ENG-41');
    expect(delivered).toEqual([notice ?? '']);

    await acceptRunInbox(location(), 'run_other', []);
    expect((await readPendingInboxState(location())).workerReports).toEqual(workerReports);

    await acceptRunInbox(location(), 'run_reports', [workerReportItem()]);
    expect((await readPendingInboxState(location())).workerReports).toBeUndefined();
    await expect(access(storedNotice())).rejects.toMatchObject({ code: 'ENOENT' });
});
