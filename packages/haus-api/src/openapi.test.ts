import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { parse } from 'yaml';

const openApiPath = fileURLToPath(new URL('../openapi.yaml', import.meta.url));

describe('Haus OpenAPI contract', () => {
    const document = parse(readFileSync(openApiPath, 'utf8')) as {
        components?: { schemas?: Record<string, unknown> };
        info?: { title?: string };
        openapi?: string;
        paths?: Record<string, unknown>;
    };

    it('declares the Haus API document', () => {
        expect(document.openapi).toBe('3.1.0');
        expect(document.info?.title).toBe('Haus API');
    });

    it('contains the first chat and realtime API slice', () => {
        expect(Object.keys(document.paths ?? {})).toEqual([
            '/api/chats',
            '/api/chats/{chat_id}',
            '/api/chats/{chat_id}/threads',
            '/api/chats/{chat_id}/follow',
            '/api/chats/{chat_id}/messages',
            '/api/chats/{chat_id}/messages/search',
            '/api/chats/{chat_id}/timeline',
            '/api/chats/{chat_id}/responses/{response_id}/evidence',
            '/api/chats/{chat_id}/deliveries',
            '/api/chats/{chat_id}/responses',
            '/api/chats/{chat_id}/responses/{response_id}/activity',
            '/api/chats/{chat_id}/activity/{activity_id}',
            '/api/chats/{chat_id}/artifacts',
            '/api/chats/{chat_id}/read',
            '/api/chats/{chat_id}/clear',
            '/api/responses/{response_id}',
            '/api/messages/{message_id}',
            '/api/turns/{run_id}/prompt',
            '/api/turns/{run_id}/file-changes',
            '/api/agent/messages/send',
            '/api/agent/agents',
            '/api/agent/agents/update',
            '/api/agent/agents/avatar',
            '/api/agent/history',
            '/api/agent/manual/get',
            '/api/agent/manual/search',
            '/api/agent/messages/search',
            '/api/agent/messages/{id}',
            '/api/agent/messages/follow',
            '/api/agent/messages/unfollow',
            '/api/agent/server',
            '/api/agent/channels/info',
            '/api/agent/channels/members',
            '/api/agent/channels/add',
            '/api/agent/tasks',
            '/api/agent/tasks/create',
            '/api/agent/tasks/claim',
            '/api/agent/tasks/unclaim',
            '/api/agent/tasks/update',
            '/api/agent/reminders',
            '/api/agent/reminders/log',
            '/api/agent/reminders/schedule',
            '/api/agent/reminders/snooze',
            '/api/agent/reminders/update',
            '/api/agent/reminders/cancel',
            '/api/triggers/{trigger_id}',
            '/api/agent/triggers',
            '/api/agent/triggers/{id}',
            '/api/agent/triggers/{id}/disable',
            '/api/agent/triggers/{id}/enable',
            '/api/agent/triggers/{id}/rotate',
            '/api/agent/triggers/{id}/log',
            '/api/agent/attachments/upload',
            '/api/agent/attachments/{id}',
            '/api/agent/profile',
            '/api/agent/avatar/generate',
            '/api/agent/profile/update',
            '/api/agent/messages/react',
            '/api/agent/skills',
            '/api/agent/skills/{id}',
            '/api/agent/skills/create',
            '/api/agent/skills/patch',
            '/api/agent/skills/write-file',
            '/api/events',
            '/api/events/ws',
        ]);
    });

    it('keeps Manual topic variants discriminated and metadata-complete', () => {
        const ajv = new Ajv2020({
            allowUnionTypes: true,
            strictSchema: false,
        });
        const validate = (schema: string, payload: unknown) =>
            ajv.compile({
                $ref: `#/components/schemas/${schema}`,
                components: document.components,
            })(payload);
        const navigation = {
            body: 'The shared Manual index.',
            id: 'index',
            kind: 'index',
            related: ['haus-cli-overview'],
            summary: 'Navigate the Manual.',
            title: 'Haus Manual',
        };
        const recipe = {
            body: '# Claim the task\n',
            class: 'technique',
            evidence: 'verified',
            id: 'recipes/technique/task-claim-lock',
            industries: ['universal'],
            kind: 'recipe',
            prereqs: ['task board or message id'],
            related: ['recipes/index'],
            summary: 'Claim canonical work before acting.',
            tier: 'seeded',
            title: 'Claim the task before work',
            triggers: ['should I claim this before starting'],
        };
        const {
            body: _navigationBody,
            related: _navigationRelated,
            ...navigationResult
        } = navigation;
        const { body: _recipeBody, related: _recipeRelated, ...recipeResult } = recipe;
        const { triggers: _recipeTriggers, ...recipeWithoutTriggers } = recipe;

        expect(validate('AgentManualTopic', navigation)).toBe(true);
        expect(validate('AgentManualTopic', recipe)).toBe(true);
        expect(validate('AgentManualTopic', { ...navigation, class: 'technique' })).toBe(false);
        expect(validate('AgentManualTopic', recipeWithoutTriggers)).toBe(false);
        expect(validate('AgentManualSearchResult', navigationResult)).toBe(true);
        expect(
            validate('AgentManualSearchResult', { ...navigationResult, class: 'technique' })
        ).toBe(false);
        expect(validate('AgentManualSearchResult', recipeResult)).toBe(true);
        expect(validate('AgentManualSearchResult', { ...recipeResult, class: undefined })).toBe(
            false
        );
    });

    it('defines durable chat identity schemas', () => {
        expect(document.components?.schemas).toHaveProperty('Chat');
        expect(document.components?.schemas).toHaveProperty('ChatMessage');
        expect(document.components?.schemas).toHaveProperty('ChatResponse');
        expect(document.components?.schemas).toHaveProperty('ResponseActivity');
        expect(document.components?.schemas).toHaveProperty('ChatArtifact');
        expect(document.components?.schemas).toHaveProperty('ChatEvent');
        expect(document.components?.schemas).toHaveProperty('ChatMessageReceipt');
        expect(document.components?.schemas).toHaveProperty('ThreadSummary');
        expect(document.components?.schemas).toHaveProperty('AgentSendResponse');
        expect(document.components?.schemas).toHaveProperty('AgentHistoryResponse');
        expect(document.components?.schemas).toHaveProperty('AgentManualTopic');
        expect(document.components?.schemas).toHaveProperty('AgentManualSearchResponse');
        expect(document.components?.schemas).toHaveProperty('AgentTaskRow');
        expect(document.components?.schemas).toHaveProperty('AgentReminder');
        expect(document.components?.schemas).toHaveProperty('AgentAttachment');
        expect(document.components?.schemas).toHaveProperty('AgentProfile');
        expect(document.components?.schemas).toHaveProperty('AgentAvatarGenerationRequest');
        expect(document.components?.schemas).toHaveProperty('AgentAvatarGenerationResponse');
        expect(document.components?.schemas).toHaveProperty('AgentReactionRequest');
        expect(document.components?.schemas).toHaveProperty('AgentSkillSummary');
    });

    it('carries the Message body kind and the Ask facts an Agent reads', () => {
        const ajv = new Ajv2020({ allowUnionTypes: true, strictSchema: false });
        const validate = (schema: string, payload: unknown) =>
            ajv.compile({
                $ref: `#/components/schemas/${schema}`,
                components: document.components,
            })(payload);
        const message = {
            attachments: [],
            author: { id: 'agt_orbit', kind: 'agent', label: 'Orbit', metadata: {} },
            body_kind: 'ask',
            chat_id: 'cht_product',
            content: 'The migration is staged. Should I run it?',
            created_at: '2026-09-03T12:00:00.000Z',
            deleted_at: null,
            delivery_id: null,
            id: 'msg_1234567890abcdef',
            metadata: {},
            nonce: 'ask-1',
            role: 'assistant',
            sequence: 7,
        };
        const ask = {
            addressee_handle: 'ada',
            id: 'ask_1234567890abcdef',
            options: ['Approve the staged migration', 'Wait for the release window'],
            status: 'open',
            title: 'Run the staged migration?',
        };

        expect(validate('ChatMessage', { ...message, ask })).toBe(true);
        expect(validate('ChatMessage', { ...message, ask: null, body_kind: 'text' })).toBe(true);
        // The body kind is not optional: a reader must never have to infer it.
        expect(validate('ChatMessage', { ...message, body_kind: undefined })).toBe(false);
        expect(validate('ChatMessage', { ...message, body_kind: 'proposal' })).toBe(false);
        expect(validate('MessageAsk', ask)).toBe(true);
        expect(validate('MessageAsk', { ...ask, addressee_handle: null })).toBe(true);
        expect(validate('MessageAsk', { ...ask, status: 'closed' })).toBe(false);
        expect(validate('MessageAsk', { ...ask, summary: 'extra' })).toBe(false);
        expect(validate('MessageAsk', { ...ask, options: [] })).toBe(true);
        expect(validate('MessageAsk', { ...ask, options: undefined })).toBe(false);
        expect(validate('MessageAsk', { ...ask, options: ['Yes', 'Yes'] })).toBe(false);
        expect(validate('MessageAsk', { ...ask, options: ['a'.repeat(81)] })).toBe(false);
        expect(
            validate('MessageAsk', { ...ask, options: ['One', 'Two', 'Three', 'Four', 'Five'] })
        ).toBe(false);
    });

    it('maps agent send discriminator values to their response variants', () => {
        const response = document.components?.schemas?.AgentSendResponse as {
            discriminator?: { mapping?: Record<string, string>; propertyName?: string };
        };
        expect(response.discriminator).toEqual({
            mapping: {
                held: '#/components/schemas/AgentHeldMessage',
                sent: '#/components/schemas/AgentSentMessage',
            },
            propertyName: 'state',
        });
    });

    it('validates extended agent success payloads and rejects empty task claims', () => {
        const ajv = new Ajv2020({
            allowUnionTypes: true,
            formats: { byte: true },
            strictSchema: false,
        });
        const validate = (schema: string, payload: unknown) =>
            ajv.compile({
                $ref: `#/components/schemas/${schema}`,
                components: document.components,
            })(payload);

        expect(
            validate('AgentAttachmentViewResponse', {
                attachment: {
                    byteSize: 2,
                    dataBase64: 'aGk=',
                    filename: 'hello.txt',
                    id: 'att_1',
                    mediaType: 'text/plain',
                },
            })
        ).toBe(true);
        expect(
            validate('AgentSkillViewResponse', {
                content: '# Audit\n',
                description: 'Audit',
                editable: true,
                enabledForYou: true,
                hash: 'abc123',
                id: 'audit',
                name: 'audit',
                supportFiles: [{ hash: 'def456', path: 'references/checklist.md' }],
            })
        ).toBe(true);
        expect(validate('AgentTaskClaimRequest', { numbers: [], target: '#general' })).toBe(false);
    });
});
