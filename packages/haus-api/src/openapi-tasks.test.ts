import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { parse } from 'yaml';

const openApiPath = fileURLToPath(new URL('../openapi.yaml', import.meta.url));
const document = parse(readFileSync(openApiPath, 'utf8')) as {
    components?: Record<string, unknown>;
};
const ajv = new Ajv2020({ allowUnionTypes: true, strictSchema: false });
const validate = (schema: string, payload: unknown) =>
    ajv.compile({ $ref: `#/components/schemas/${schema}`, components: document.components })(
        payload
    );

const task = {
    archivedAt: null,
    createdAt: '2026-11-04T12:00:00.000Z',
    createdBy: { handle: 'zach', type: 'human' },
    shortId: 'k3mq7xta',
    title: 'Rotate the deploy key',
    updatedAt: '2026-11-04T12:00:00.000Z',
    version: 4,
};

test('Agent API task receipts carry a short id and an archive time, not backlog fields', () => {
    expect(validate('AgentTaskSingleResponse', { task })).toBe(true);
    expect(validate('AgentTaskSingleResponse', { task: { ...task, shortId: 'SEC-12' } })).toBe(
        false
    );
    expect(validate('AgentTaskSingleResponse', { task: { ...task, state: 'open' } })).toBe(false);
    expect(validate('AgentTaskSingleResponse', { task: { ...task, priority: 'high' } })).toBe(
        false
    );
    expect(
        validate('AgentTaskSingleResponse', {
            task: { ...task, archivedAt: '2026-11-05T12:00:00.000Z' },
        })
    ).toBe(true);
});

test('Agent API task requests address Tasks by short id or id', () => {
    expect(validate('AgentTaskArchiveRequest', { task: 'k3mq7xta' })).toBe(true);
    expect(validate('AgentTaskArchiveRequest', { key: 'SEC-12' })).toBe(false);
    expect(document.components?.schemas).not.toHaveProperty('AgentTaskAssignRequest');
    expect(document.components?.schemas).not.toHaveProperty('AgentTaskUpdateRequest');
    expect(document.components?.schemas).not.toHaveProperty('AgentTaskStateRequest');
});

test('REST messages may carry resolved task links', () => {
    const link = { short_id: 'k3mq7xta', task_id: 'tsk_12', text: '[the key](task://tsk_12)' };
    expect(validate('MessageTaskLink', link)).toBe(true);
    expect(validate('MessageTaskLink', { ...link, short_id: 'SEC-12' })).toBe(false);
    expect(validate('MessageTaskLink', { ...link, taskId: 'tsk_12' })).toBe(false);
});

test('Agent API starts crew with a brief and archives it', () => {
    const start = { brief: 'Rotate the key.', from: 'msg_origin', target: '#security' };
    expect(validate('AgentTaskStartRequest', start)).toBe(true);
    expect(validate('AgentTaskStartRequest', { ...start, state: 'open' })).toBe(false);
    expect(validate('AgentTaskStartRequest', { target: '#security', title: 'Rotate' })).toBe(false);
    const started = { state: 'started', target: 'task:k3mq7xta', task };
    expect(validate('AgentTaskStartResponse', started)).toBe(true);
    expect(validate('AgentTaskStartResponse', { ...started, target: 'task:SEC-12' })).toBe(false);
    const pr = { task: 'k3mq7xta', url: 'https://github.com/zknicker/haus/pull/42' };
    expect(validate('AgentTaskAttachPullRequestRequest', pr)).toBe(true);
    expect(
        validate('AgentTaskAttachPullRequestRequest', { ...pr, url: 'https://example.com/pr/42' })
    ).toBe(false);
});
