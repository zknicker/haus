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
    assignee: { handle: 'zero', type: 'agent' },
    completedAt: null,
    createdAt: '2026-11-04T12:00:00.000Z',
    createdBy: { handle: 'zach', type: 'human' },
    dueOn: null,
    key: 'SEC-12',
    labels: ['security'],
    priority: 'high',
    state: 'open',
    title: 'Rotate the deploy key',
    updatedAt: '2026-11-04T12:00:00.000Z',
    version: 4,
};

test('Agent API task receipts carry keys and states, not board columns', () => {
    expect(validate('AgentTaskSingleResponse', { task })).toBe(true);
    expect(validate('AgentTaskSingleResponse', { task: { ...task, key: 'sec-12' } })).toBe(false);
    expect(validate('AgentTaskSingleResponse', { task: { ...task, state: 'active' } })).toBe(false);
    expect(validate('AgentTaskSingleResponse', { task: { ...task, column: 'Done' } })).toBe(false);
    expect(validate('AgentTaskSingleResponse', { task: { ...task, assignee: null } })).toBe(true);
});

test('Agent API task requests address Tasks by key', () => {
    expect(validate('AgentTaskAssignRequest', { assignee: null, key: 'SEC-12' })).toBe(true);
    expect(validate('AgentTaskAssignRequest', { key: 'SEC-12' })).toBe(false);
    expect(validate('AgentTaskUpdateRequest', { key: 'SEC-12' })).toBe(false);
    expect(validate('AgentTaskUpdateRequest', { key: 'SEC-12', priority: 'low' })).toBe(true);
    expect(document.components?.schemas).not.toHaveProperty('AgentTaskCreateRequest');
    expect(document.components?.schemas).not.toHaveProperty('AgentBoard');
});

test('REST messages may carry resolved task links', () => {
    const link = { key: 'SEC-12', task_id: 'tsk_12', text: 'SEC-12' };
    expect(validate('MessageTaskLink', link)).toBe(true);
    expect(validate('MessageTaskLink', { ...link, key: 'sec-12' })).toBe(false);
    expect(validate('MessageTaskLink', { ...link, taskId: 'tsk_12' })).toBe(false);
});

test('Agent API starts Tasks from a Channel message and sets their state', () => {
    const start = { from: 'msg_origin', target: '#security', title: 'Rotate' };
    expect(validate('AgentTaskStartRequest', start)).toBe(true);
    expect(validate('AgentTaskStartRequest', { target: '#security', title: 'Rotate' })).toBe(false);
    expect(validate('AgentTaskStartResponse', { target: 'task:SEC-12', task })).toBe(true);
    expect(validate('AgentTaskStartResponse', { target: '#security', task })).toBe(false);
    expect(validate('AgentTaskStateRequest', { key: 'SEC-12', state: 'done' })).toBe(true);
    expect(validate('AgentTaskStateRequest', { key: 'SEC-12', state: 'active' })).toBe(false);
    const pr = { key: 'SEC-12', url: 'https://github.com/zknicker/haus/pull/42' };
    expect(validate('AgentTaskAttachPullRequestRequest', pr)).toBe(true);
    expect(
        validate('AgentTaskAttachPullRequestRequest', { ...pr, url: 'https://example.com/pr/42' })
    ).toBe(false);
});
