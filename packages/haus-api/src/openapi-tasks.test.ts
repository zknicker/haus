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
    board: 'SEC',
    category: 'active',
    column: 'In progress',
    columnId: 'col_active',
    completedAt: null,
    createdAt: '2026-11-04T12:00:00.000Z',
    createdBy: { handle: 'zach', type: 'human' },
    dueOn: null,
    key: 'SEC-12',
    labels: ['security'],
    priority: 'high',
    title: 'Rotate the deploy key',
    updatedAt: '2026-11-04T12:00:00.000Z',
    version: 4,
};

test('Agent API task receipts carry keys and the move queue', () => {
    expect(validate('AgentTaskMoveResponse', { queue: { active: 1, todo: 3 }, task })).toBe(true);
    expect(validate('AgentTaskMoveResponse', { task })).toBe(false);
    expect(validate('AgentTaskSingleResponse', { task: { ...task, key: 'sec-12' } })).toBe(false);
    expect(validate('AgentTaskSingleResponse', { task: { ...task, category: 'blocked' } })).toBe(
        false
    );
    expect(validate('AgentTaskSingleResponse', { task: { ...task, assignee: null } })).toBe(true);
});

test('Agent API task and board requests address Tasks by key', () => {
    expect(validate('AgentTaskMoveRequest', { column: 'Done', key: 'SEC-12' })).toBe(true);
    expect(validate('AgentTaskMoveRequest', { column: 'Done', taskId: 'tsk_12' })).toBe(false);
    expect(validate('AgentTaskAssignRequest', { assignee: null, key: 'SEC-12' })).toBe(true);
    expect(validate('AgentTaskAssignRequest', { key: 'SEC-12' })).toBe(false);
    expect(validate('AgentTaskUpdateRequest', { key: 'SEC-12' })).toBe(false);
    expect(validate('AgentTaskUpdateRequest', { key: 'SEC-12', priority: 'low' })).toBe(true);
    expect(validate('AgentTaskCreateRequest', { board: 'SEC', title: 'Rotate' })).toBe(true);
    expect(validate('AgentTaskCreateRequest', { board: 'sec', title: 'Rotate' })).toBe(false);
    expect(validate('AgentBoardCreateRequest', { key: 'SEC', name: 'Security' })).toBe(true);
    expect(validate('AgentBoardCreateRequest', { key: 'sec', name: 'Security' })).toBe(false);
    expect(
        validate('AgentBoardColumnsRequest', {
            board: 'SEC',
            columns: [{ category: 'review', name: 'Review' }],
        })
    ).toBe(false);
});

test('REST messages may carry resolved task links', () => {
    const link = { key: 'SEC-12', task_id: 'tsk_12', text: 'SEC-12' };
    expect(validate('MessageTaskLink', link)).toBe(true);
    expect(validate('MessageTaskLink', { ...link, key: 'sec-12' })).toBe(false);
    expect(validate('MessageTaskLink', { ...link, taskId: 'tsk_12' })).toBe(false);
});
