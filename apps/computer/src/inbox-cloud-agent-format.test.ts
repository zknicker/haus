import { expect, test } from 'bun:test';
import { parseInbox } from './agent-inbox-input.ts';
import type { AgentInboxItem } from './agent-inbox-item.ts';
import { composeInboxDrain, composeInboxNotice } from './inbox-format.ts';

test('a native question reaches the Agent as input attention with its exact answer contract', () => {
    const attention = item({
        content: '',
        id: 'cai_input',
        senderHandle: 'haus',
        senderType: 'system',
        sequence: 0,
        cloudAgentInput: {
            title: 'Pick the route',
            repository: 'owner/repo',
            providerUrl: 'https://claude.ai/code/session_example',
            request: {
                id: 'cai_input',
                workId: 'caw_work',
                runId: 'car_run',
                sessionId: '12345678-1234-4234-8234-123456789abc',
                promptId: 'prompt',
                toolUseId: 'tool',
                questions: [
                    {
                        question: 'Which route?',
                        header: 'Route',
                        multiSelect: false,
                        options: [
                            { label: 'alpha', description: 'First' },
                            { label: 'beta', description: 'Second' },
                        ],
                    },
                ],
                answer: null,
                state: 'pending',
                createdAt: '2026-10-13T00:00:00.000Z',
                resumedPromptId: null,
                resumedToolUseId: null,
            },
        },
    });
    expect(parseInbox([attention])).toEqual([attention]);
    expect(parseInbox([{ ...attention, id: 'cai_wrong' }])).toBeNull();
    const drain = composeInboxDrain([attention]);
    expect(drain).toContain('haus cloud-agent answer --request cai_input');
    expect(drain).toContain('Which route?');
    expect(drain).toContain('human judgment or expanded authority');
    expect(drain).toContain('after native consumption');
    expect(composeInboxNotice([attention])).toContain('cloud agent pending input');
    expect(composeInboxNotice([attention])).not.toContain('Which route?');
});

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

    const drain = composeInboxDrain([attention]);

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

    expect(composeInboxDrain([attention])).toContain(
        'branches=haus/haus:cloud/fix-flake pr=https://github.com/haus/haus/pull/56 state=draft files=1 +34 -0'
    );
});

test('a follow-up that never reached the provider tells its Agent why', () => {
    const attention = item({
        chatId: 'cht_origin',
        cloudAgentWork: {
            branches: [],
            errorCode: 'followup-delivery-timeout',
            provider: 'cursor',
            providerUrl: 'https://cursor.com/agents/bc_one',
            repository: 'haus/haus',
            runId: 'car_1234567890abcdef',
            status: 'failed',
            summary:
                'The provider did not accept the follow-up within 30 minutes (31 attempts). Last error: Agent already has an active run in progress',
            title: 'Fix the flaky delivery test',
            workId: 'caw_1234567890abcdef',
        },
        content: '',
        id: 'car_1234567890abcdef',
        senderHandle: 'haus',
        senderType: 'system',
        sequence: 0,
    });

    const drain = composeInboxDrain([attention]);
    expect(drain).toContain('[Haus cloud agent attention status=failed');
    expect(drain).toContain('errorCode=followup-delivery-timeout');
    expect(drain).toContain(
        'summary=The provider did not accept the follow-up within 30 minutes (31 attempts). Last error: Agent already has an active run in progress'
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
