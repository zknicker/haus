import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { agentTriggerCreateInputSchema, agentTriggerSchema } from './agent-triggers.ts';
import {
    triggerCreateInputSchema,
    triggerInstructionMaxBytes,
    triggerKindSchema,
    triggerSchema,
    triggerSecretResultSchema,
    triggerSetStatusInputSchema,
    triggerUpdateInputSchema,
} from './triggers.ts';

const trigger = {
    anchorChatId: 'cht_all',
    anchorMessageId: 'msg_anchor',
    createdAt: '2026-09-03T12:00:00.000Z',
    createdByHandle: 'zach',
    createdByUserId: 'usr_zach',
    disabledAt: null,
    fireCount: 0,
    id: 'trg_one',
    instruction: null,
    kind: 'webhook',
    lastFiredAt: null,
    ownerAgentId: 'agt_cove',
    ownerHandle: 'cove',
    status: 'armed',
    title: 'Deploy finished',
    updatedAt: '2026-09-03T12:00:00.000Z',
    url: 'https://haus.example/api/triggers/trg_one',
    version: 1,
};

describe('trigger contracts', () => {
    test('carries the kind, the creator, and the public URL, and never a secret', () => {
        const parsed = triggerSchema.parse(trigger);

        expect(parsed).toMatchObject({
            createdByHandle: 'zach',
            createdByUserId: 'usr_zach',
            kind: 'webhook',
            url: 'https://haus.example/api/triggers/trg_one',
        });
        expect(parsed).not.toHaveProperty('secret');
        // A human wires a Trigger from the Automations drawer with no asking
        // message; it anchors on the DM chat and carries no anchor message.
        expect(triggerSchema.parse({ ...trigger, anchorMessageId: null })).toMatchObject({
            anchorMessageId: null,
        });
        expect(() => triggerSchema.parse({ ...trigger, secret: 'grtt_leak' })).toThrow();
        expect(() => triggerSchema.parse({ ...trigger, kind: 'schedule' })).toThrow();
        expect(triggerKindSchema.options).toEqual(['webhook', 'github']);
    });

    test('an Agent-created trigger has no creator, and the Agent view inherits the URL', () => {
        const agentTrigger = agentTriggerSchema.parse({
            ...trigger,
            anchorTarget: '#all',
            createdByHandle: null,
            createdByUserId: null,
        });

        expect(agentTrigger).toMatchObject({
            anchorTarget: '#all',
            createdByUserId: null,
            url: trigger.url,
        });
    });

    test('the Agent create input defaults the kind and refuses an unknown one', () => {
        expect(
            agentTriggerCreateInputSchema.parse({ messageId: 'msg_anchor', title: 'Deploy' })
        ).toEqual({ kind: 'webhook', messageId: 'msg_anchor', title: 'Deploy' });
        expect(() =>
            agentTriggerCreateInputSchema.parse({
                kind: 'schedule',
                messageId: 'msg_anchor',
                title: 'Deploy',
            })
        ).toThrow();
    });

    test('the operator create input names the Agent and the kind explicitly', () => {
        expect(
            triggerCreateInputSchema.parse({
                agentId: 'agt_cove',
                kind: 'webhook',
                serverId: 'srv_one',
                title: '  Deploy finished  ',
            })
        ).toEqual({
            agentId: 'agt_cove',
            kind: 'webhook',
            serverId: 'srv_one',
            title: 'Deploy finished',
        });
        expect(() =>
            triggerCreateInputSchema.parse({
                agentId: 'agt_cove',
                serverId: 'srv_one',
                title: 'Deploy finished',
            })
        ).toThrow();
    });

    test('an update must change something, and status is armed or disabled', () => {
        expect(
            triggerUpdateInputSchema.parse({
                instruction: null,
                serverId: 'srv_one',
                triggerId: 'trg_one',
            })
        ).toMatchObject({ instruction: null });
        expect(
            triggerUpdateInputSchema.parse({
                serverId: 'srv_one',
                title: 'Renamed',
                triggerId: 'trg_one',
            })
        ).toMatchObject({ title: 'Renamed' });
        expect(() =>
            triggerUpdateInputSchema.parse({ serverId: 'srv_one', triggerId: 'trg_one' })
        ).toThrow();
        expect(() =>
            triggerSetStatusInputSchema.parse({
                serverId: 'srv_one',
                status: 'paused',
                triggerId: 'trg_one',
            })
        ).toThrow();
    });

    test('the instruction limit is bytes, so a multibyte instruction of the same length fails', () => {
        const ascii = 'a'.repeat(triggerInstructionMaxBytes);
        const multibyte = 'é'.repeat(triggerInstructionMaxBytes);

        expect(
            agentTriggerCreateInputSchema.parse({
                instruction: ascii,
                messageId: 'msg_anchor',
                title: 'Deploy',
            }).instruction
        ).toBe(ascii);
        expect(() =>
            agentTriggerCreateInputSchema.parse({
                instruction: multibyte,
                messageId: 'msg_anchor',
                title: 'Deploy',
            })
        ).toThrow(/at most 4096 bytes/);

        expect(
            triggerCreateInputSchema.parse({
                agentId: 'agt_cove',
                instruction: ascii,
                kind: 'webhook',
                serverId: 'srv_one',
                title: 'Deploy finished',
            }).instruction
        ).toBe(ascii);
        expect(() =>
            triggerCreateInputSchema.parse({
                agentId: 'agt_cove',
                instruction: multibyte,
                kind: 'webhook',
                serverId: 'srv_one',
                title: 'Deploy finished',
            })
        ).toThrow(/at most 4096 bytes/);

        expect(
            triggerUpdateInputSchema.parse({
                instruction: ascii,
                serverId: 'srv_one',
                triggerId: 'trg_one',
            }).instruction
        ).toBe(ascii);
        expect(() =>
            triggerUpdateInputSchema.parse({
                instruction: multibyte,
                serverId: 'srv_one',
                triggerId: 'trg_one',
            })
        ).toThrow(/at most 4096 bytes/);
    });

    test('only the secret result carries a secret, and it carries the whole trigger', () => {
        const result = triggerSecretResultSchema.parse({
            curl: 'curl -X POST https://haus.example/api/triggers/trg_one',
            secret: 'grtt_once',
            trigger,
            url: trigger.url,
        });

        expect(result.trigger.kind).toBe('webhook');
        expect(result.secret).toBe('grtt_once');
    });

    test('the OpenAPI document describes the same trigger shape', () => {
        const document = parse(
            readFileSync(fileURLToPath(new URL('../openapi.yaml', import.meta.url)), 'utf8')
        ) as {
            components: {
                schemas: Record<
                    string,
                    {
                        enum?: string[];
                        properties?: Record<string, unknown>;
                        required?: string[];
                        type?: string;
                    }
                >;
            };
        };
        const schemas = document.components.schemas;

        expect(schemas.TriggerKind).toEqual({ enum: ['webhook', 'github'], type: 'string' });
        expect(schemas.WebhookTrigger.required).toEqual(Object.keys(trigger).sort());
        expect(schemas.GithubTrigger.required).toEqual(
            [...Object.keys(trigger).filter((key) => key !== 'url'), 'github'].sort()
        );
        expect(schemas.AgentTriggerCreateRequest.properties).toHaveProperty('kind');
    });
});
