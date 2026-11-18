import { expect, test } from 'bun:test';

import { agentTriggerResultSchema } from '@haus/api';

import {
    agentTriggerDeleteResultResponseSchema,
    agentTriggerListResponseSchema,
    agentTriggerLogResponseSchema,
    agentTriggerResultResponseSchema,
    agentTriggerSecretResultResponseSchema,
    githubTriggerPreviewResultResponseSchema,
} from './agent-trigger-response-schema.ts';

const triggerBase = {
    anchorChatId: 'cht_product',
    anchorMessageId: null,
    createdAt: '2026-09-04T12:00:00.000Z',
    createdByHandle: 'zach',
    createdByUserId: 'usr_zach',
    disabledAt: null,
    fireCount: 3,
    id: 'trg_webhook1234567890',
    instruction: null,
    lastFiredAt: '2026-09-04T12:00:00.000Z',
    ownerAgentId: 'agt_orbit',
    ownerHandle: 'orbit',
    status: 'armed',
    title: 'Deploy webhook',
    updatedAt: '2026-09-04T12:00:00.000Z',
    version: 1,
};

/**
 * A current Server's webhook and github Triggers, plus a field a future
 * Server release might additively send at every nesting level: the trigger
 * itself, its `github` block, one of its event filters, and its repository
 * scope.
 */
const webhookTriggerWithUnknownFields = {
    ...triggerBase,
    anchorTarget: 'dm:zach',
    futureWebhookTriggerField: 'a field this Computer build predates',
    kind: 'webhook',
    url: 'https://example.com/hook',
};

const githubTriggerWithUnknownFields = {
    ...triggerBase,
    anchorTarget: 'dm:zach',
    futureGithubTriggerField: true,
    github: {
        events: [{ event: 'push', futureEventField: true }],
        futureGithubBlockField: true,
        installationId: 'ghi_1234567890',
        installationLogin: 'haus',
        problem: null,
        problemSince: null,
        repositories: { futureRepositoriesField: true, scope: 'installation' },
        suppressedCount: 0,
    },
    id: 'trg_github1234567890',
    kind: 'github',
};

test('the canonical strict trigger result schema rejects a field it does not know', () => {
    expect(() =>
        agentTriggerResultSchema.parse({ trigger: webhookTriggerWithUnknownFields })
    ).toThrow(/futureWebhookTriggerField/);
});

test('the Computer response schema parses a webhook trigger carrying fields from a newer Server', () => {
    const parsed = agentTriggerResultResponseSchema.parse({
        trigger: webhookTriggerWithUnknownFields,
    });
    expect(parsed.trigger.id).toBe('trg_webhook1234567890');
});

test('the Computer response schema parses a github trigger carrying fields from a newer Server, at every nesting level', () => {
    const parsed = agentTriggerResultResponseSchema.parse({
        trigger: githubTriggerWithUnknownFields,
    });
    expect(parsed.trigger.id).toBe('trg_github1234567890');
    if (parsed.trigger.kind === 'github') {
        expect(parsed.trigger.github.installationId).toBe('ghi_1234567890');
        expect(parsed.trigger.github.events[0]?.event).toBe('push');
    }
});

test('the Computer response schema tolerates an unknown field on a trigger list', () => {
    const payload = {
        futureListField: true,
        triggers: [webhookTriggerWithUnknownFields, githubTriggerWithUnknownFields],
    };
    expect(agentTriggerListResponseSchema.parse(payload).triggers).toHaveLength(2);
});

test('the Computer response schema tolerates an unknown field on a webhook secret result', () => {
    const payload = {
        curl: 'curl ...',
        futureSecretField: true,
        secret: 'grtt_secret',
        trigger: webhookTriggerWithUnknownFields,
        url: 'https://example.com/hook',
    };
    expect(agentTriggerSecretResultResponseSchema.parse(payload).trigger.id).toBe(
        'trg_webhook1234567890'
    );
});

test('the Computer response schema tolerates an unknown field on a delete result', () => {
    const payload = { deleted: true, futureDeleteField: true, id: 'trg_webhook1234567890' };
    expect(agentTriggerDeleteResultResponseSchema.parse(payload).id).toBe('trg_webhook1234567890');
});

test('the Computer response schema tolerates an unknown field on a fire log, at every nesting level', () => {
    const fires = {
        fires: [
            {
                contentType: 'application/json',
                dedupeKey: null,
                futureFireField: true,
                id: 'trf_abc1234567890',
                payloadBytes: 128,
                receivedAt: '2026-09-04T12:00:00.000Z',
                triggerId: 'trg_webhook1234567890',
            },
        ],
        futureLogField: true,
        kind: 'fires',
    };
    const parsedFires = agentTriggerLogResponseSchema.parse(fires);
    expect(parsedFires.kind === 'fires' && parsedFires.fires).toHaveLength(1);

    const fire = {
        fire: {
            contentType: 'application/json',
            dedupeKey: null,
            futureFireDetailField: true,
            id: 'trf_abc1234567890',
            payload: '{}',
            payloadBytes: 128,
            receivedAt: '2026-09-04T12:00:00.000Z',
            triggerId: 'trg_webhook1234567890',
        },
        kind: 'fire',
    };
    const parsedFire = agentTriggerLogResponseSchema.parse(fire);
    expect(parsedFire.kind === 'fire' && parsedFire.fire.id).toBe('trf_abc1234567890');
});

test('the Computer response schema tolerates an unknown field on a github event preview, at every nesting level', () => {
    const payload = {
        futurePreviewField: true,
        groups: [{ futureGroupField: true, index: 0, matches: true }],
        matches: true,
        repositoryInScope: true,
    };
    expect(githubTriggerPreviewResultResponseSchema.parse(payload).groups).toHaveLength(1);
});
