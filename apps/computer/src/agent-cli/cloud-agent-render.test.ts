import { expect, test } from 'bun:test';
import {
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
    id: 'caw_1234567890abcdef',
    job: { followUp: null, startedAt: null, state: 'working' as const },
    messageId: 'msg_1a2b3c4d5e6f7890',
    provider: 'cursor' as const,
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

const request = { repository: 'haus/haus', startingRef: 'main', target: '#product' };

test('the start receipt keeps its work thread and adds the link to paste elsewhere', () => {
    expect(renderCloudAgentStart(receipt('#product'), request)).toBe(
        [
            'Cloud agent started for haus/haus@main. Work ID: caw_1234567890abcdef',
            'Posted to #product. Message ID: msg_1a2b3c4d5e6f7890',
            'Work thread: "#product:1a2b3c4d".',
            'The result reaches your inbox when the run settles; post what you learn yourself.',
            'Link: [Fix the flaky delivery test](cloud-agent://caw_1234567890abcdef)',
            'To show this work in another conversation, paste its Link line into haus message send.',
            '',
        ].join('\n')
    );
});

test('a launch inside a thread names that thread as its work thread', () => {
    const printed = renderCloudAgentStart(receipt('#product:9f8e7d6c'), {
        ...request,
        target: '#product:9f8e7d6c',
    });
    expect(printed).toContain('Work thread: "#product:9f8e7d6c".');
    expect(printed).toContain('Link: [Fix the flaky delivery test](cloud-agent://');
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
