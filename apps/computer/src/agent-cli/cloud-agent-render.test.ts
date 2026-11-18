import { expect, test } from 'bun:test';
import {
    findCloudAgentReportRun,
    renderCloudAgentReportText,
    renderCloudAgentStart,
    renderCloudAgentWorkDetail,
    renderCloudAgentWorkList,
} from './cloud-agent-render.ts';

const work = {
    activity: null,
    agentId: 'agt_orbit',
    cancelRequestedAt: null,
    cancelRequestedBy: null,
    chatId: 'cht_product',
    computerId: 'cmp_studio',
    createdAt: '2026-09-04T12:00:00.000Z',
    environmentId: null,
    environmentName: null,
    id: 'caw_1234567890abcdef',
    job: { followUp: null, startedAt: null, state: 'working' as const },
    messageId: 'msg_1a2b3c4d5e6f7890',
    provider: 'cursor' as const,
    pullRequest: null,
    providerAgentId: null,
    providerUrl: null,
    repository: 'haus/haus',
    runs: [],
    startedAt: null,
    startingRef: 'main',
    status: 'queued' as const,
    terminalAt: null,
    title: 'Fix the flaky delivery test',
    updatedAt: '2026-09-04T12:00:00.000Z',
};

function receipt(target: string) {
    return {
        chatId: 'cht_product',
        idempotent: false,
        messageId: work.messageId,
        runId: 'car_1234567890abcdef',
        sequence: 7,
        state: 'started' as const,
        target,
        work,
    };
}

const request = { repository: 'haus/haus', startingRef: 'main', target: 'task:SEC-12' };

test('the start receipt names the Task it reports to and adds the link to paste elsewhere', () => {
    expect(renderCloudAgentStart(receipt('task:SEC-12'), request)).toBe(
        [
            'Cloud agent launching for haus/haus@main. Work ID: caw_1234567890abcdef',
            'Posted to task:SEC-12. Message ID: msg_1a2b3c4d5e6f7890',
            'Haus wakes you on task:SEC-12 when the run settles, a failed launch included, and when its pull request becomes ready or its checks finish; post what you learn yourself.',
            'Link: [Fix the flaky delivery test](cloud-agent://caw_1234567890abcdef)',
            'To show this work in another conversation, paste its Link line into haus message send.',
            '',
        ].join('\n')
    );
});

test('inspect prints each work with its link, escaping titles the link grammar cannot hold', () => {
    const awkward = { ...work, id: 'caw_2', title: 'Fix [flaky] test\nnow' };
    const listed = renderCloudAgentWorkList([work, awkward]);

    expect(listed).toContain(
        'caw_1234567890abcdef [queued] Fix the flaky delivery test (haus/haus)\n  Link: [Fix the flaky delivery test](cloud-agent://caw_1234567890abcdef)'
    );
    expect(listed).toContain('  Link: [Fix \\[flaky test now](cloud-agent://caw_2)');
    expect(listed).toEndWith('paste its Link line into haus message send.\n');
    expect(renderCloudAgentWorkList([])).toBe('No cloud agent work found.\n');

    const detail = renderCloudAgentWorkDetail([work]);
    expect(JSON.parse(detail.slice(0, detail.indexOf('\nLink: ')))).toEqual([work]);
    expect(detail).toContain(
        '\nLink: [Fix the flaky delivery test](cloud-agent://caw_1234567890abcdef)\n'
    );
    expect(renderCloudAgentWorkDetail([])).toBe('[]\n');
});

test('the detail dump points to --report only for a Run whose stored report outgrew its summary', () => {
    const outgrown = {
        ...work,
        id: 'caw_outgrown',
        runs: [
            {
                report: { clipped: false, text: 'Opened a pull request. Also ran the full suite.' },
                runId: 'car_outgrown',
                summary: 'Opened a pull request.',
            },
        ],
    };
    const noMore = {
        ...work,
        id: 'caw_no_more',
        runs: [
            { report: { clipped: false, text: 'Done.' }, runId: 'car_no_more', summary: 'Done.' },
        ],
    };
    const noReport = {
        ...work,
        id: 'caw_no_report',
        runs: [{ report: null, runId: 'car_no_report', summary: 'Done.' }],
    };

    const detail = renderCloudAgentWorkDetail([outgrown, noMore, noReport]);
    expect(detail).toContain('More: haus cloud-agent inspect --work caw_outgrown --report');
    expect(detail).not.toContain('--work caw_no_more --report');
    expect(detail).not.toContain('--work caw_no_report --report');
});

test('findCloudAgentReportRun resolves the newest Run with a report by default, or one named by id', () => {
    const olderWithReport = {
        report: { clipped: false, text: 'Older report.' },
        runId: 'car_older',
        summary: null,
    };
    const newestWithoutReport = { report: null, runId: 'car_newest', summary: null };
    // Runs are newest-first, matching the stored shape `cloudAgentRunSchema` documents.
    const works = [{ id: 'caw_1', runs: [newestWithoutReport, olderWithReport] }];

    expect(findCloudAgentReportRun(works, 'caw_1')).toEqual(olderWithReport);
    expect(findCloudAgentReportRun(works, 'caw_1', 'car_newest')).toEqual(newestWithoutReport);
    expect(findCloudAgentReportRun(works, 'caw_1', 'car_missing')).toBeUndefined();
    expect(findCloudAgentReportRun(works, 'caw_missing')).toBeUndefined();
});

test('renderCloudAgentReportText prints the full text, with a clip marker only when clipped', () => {
    expect(
        renderCloudAgentReportText({
            report: { clipped: false, text: 'Opened a pull request.' },
            runId: 'car_1',
        })
    ).toBe('Opened a pull request.\n');
    expect(
        renderCloudAgentReportText({
            report: { clipped: true, text: 'Opened a pull request.' },
            runId: 'car_1',
        })
    ).toBe('Opened a pull request.\n[clipped at 64 KiB]\n');
});

test('a pinned Claude environment shows as a short marker on its list line, never on an unpinned one', () => {
    const pinned = { ...work, environmentName: 'Fast', provider: 'claude' as const };
    const listed = renderCloudAgentWorkList([work, pinned]);

    expect(listed).toContain(
        'caw_1234567890abcdef [queued] Fix the flaky delivery test (haus/haus)'
    );
    expect(listed).toContain(
        'caw_1234567890abcdef [queued] [Fast] Fix the flaky delivery test (haus/haus)'
    );
});
