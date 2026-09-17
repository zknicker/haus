import { expect, test } from 'bun:test';
import type { AgentInboxItem } from './agent-inbox-item.ts';
import { composeInboxDrain, composeInboxNotice } from './inbox-format.ts';

test('projects a settled Cloud Agent Run with the evidence its Agent must inspect', () => {
    const attention = item({
        chatId: 'cht_origin',
        cloudAgentWork: {
            branches: [
                {
                    branch: 'cloud/fix-flake',
                    pullRequestUrl: 'https://github.com/haus/haus/pull/12',
                    repository: 'haus/haus',
                },
            ],
            errorCode: null,
            provider: 'cursor',
            providerUrl: 'https://cursor.com/agents/bc_one',
            repository: 'haus/haus',
            runId: 'car_1234567890abcdef',
            status: 'completed',
            summary: 'Opened a pull request.',
            title: 'Fix the flaky delivery test',
            workId: 'caw_1234567890abcdef',
        },
        content: '',
        id: 'car_1234567890abcdef',
        senderHandle: 'haus',
        senderType: 'system',
        sequence: 0,
    });

    const drain = composeInboxDrain([attention], 'UTC');

    expect(drain).toContain(
        '[Haus cloud agent attention status=completed work=caw_1234567890abcdef run=car_1234567890abcdef target=#general]'
    );
    expect(drain).toContain('summary=Opened a pull request.');
    expect(drain).toContain(
        'branches=haus/haus:cloud/fix-flake pr=https://github.com/haus/haus/pull/12'
    );
    // No GitHub snapshot was recorded, so the branch line states the URL alone.
    expect(drain).not.toContain('files=');
    const notice = composeInboxNotice([attention]);
    expect(notice).toContain('pending: 1 work item');
    expect(notice).toContain('· cloud agent result');
    expect(notice).toContain('msg=-');
    expect(notice).not.toContain('Opened a pull request.');
});

test('a branch whose pull request was read states the diff the Agent can act on', () => {
    const attention = item({
        chatId: 'cht_origin',
        cloudAgentWork: {
            branches: [
                {
                    branch: 'cloud/fix-flake',
                    pullRequest: {
                        additions: 34,
                        changedFiles: 1,
                        deletions: 0,
                        number: 56,
                        observedAt: '2026-09-05T12:00:00.000Z',
                        state: 'draft',
                    },
                    pullRequestUrl: 'https://github.com/haus/haus/pull/56',
                    repository: 'haus/haus',
                },
            ],
            errorCode: null,
            provider: 'cursor',
            providerUrl: 'https://cursor.com/agents/bc_one',
            repository: 'haus/haus',
            runId: 'car_1234567890abcdef',
            status: 'completed',
            summary: 'Opened a pull request.',
            title: 'Fix the flaky delivery test',
            workId: 'caw_1234567890abcdef',
        },
        content: '',
        id: 'car_1234567890abcdef',
        senderHandle: 'haus',
        senderType: 'system',
        sequence: 0,
    });

    expect(composeInboxDrain([attention], 'UTC')).toContain(
        'branches=haus/haus:cloud/fix-flake pr=https://github.com/haus/haus/pull/56 state=draft files=1 +34 -0'
    );
});

function item(overrides: Partial<AgentInboxItem> = {}): AgentInboxItem {
    return {
        chatId: 'cht_general',
        content: 'Ship it',
        createdAt: '2026-07-27T00:00:00.000Z',
        id: 'msg_first',
        senderHandle: 'zach',
        senderType: 'human',
        sequence: 1,
        target: '#general',
        ...overrides,
    };
}
