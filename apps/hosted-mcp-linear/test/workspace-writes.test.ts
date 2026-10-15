import { describe, expect, test } from 'bun:test';
import { linearClientEntityId } from '@haus/api/linear-actor-meta';
import { callTool, data, fakeLinear, linearError, workspaceMeta } from './fake-linear.ts';

const teamId = '9d1f6d38-2d55-4c8e-a3f5-6a7e1f3e8b10';
const op0 = linearClientEntityId(workspaceMeta.idSeed, 0);
const updatedAt = '2026-10-15T12:00:00.000Z';

describe('workspace creates', () => {
    const cases = [
        {
            args: { description: 'Niche', name: 'Cat dads', teams: [teamId] },
            entityType: 'project',
            input: { description: 'Niche', name: 'Cat dads', teamIds: [teamId] },
            mutation: 'projectCreate',
            read: 'project',
            resultKey: 'project',
            tool: 'create_project',
        },
        {
            args: { content: '# Brief', project: 'project-1', title: 'Brief' },
            entityType: 'document',
            input: { content: '# Brief', projectId: 'project-1', title: 'Brief' },
            mutation: 'documentCreate',
            read: 'document',
            resultKey: 'document',
            tool: 'create_document',
        },
        {
            args: { color: '#5E6AD2', name: 'Print ready', team: teamId },
            entityType: 'label',
            input: { color: '#5E6AD2', name: 'Print ready', teamId },
            mutation: 'issueLabelCreate',
            read: 'issueLabel',
            resultKey: 'issueLabel',
            tool: 'create_label',
        },
    ] as const;

    for (const testCase of cases) {
        test(`${testCase.tool} creates with the derived id and no attribution`, async () => {
            const linear = fakeLinear({
                Create: () =>
                    data({
                        [testCase.mutation]: {
                            [testCase.resultKey]: { id: op0, updatedAt },
                            success: true,
                        },
                    }),
            });
            const { report } = await callTool(linear, testCase.tool, testCase.args);
            expect(linear.requests[0]?.query).toContain(`${testCase.mutation}(input: $input)`);
            expect(linear.requests[0]?.variables.input).toEqual({ ...testCase.input, id: op0 });
            expect(report.mutations).toEqual([
                {
                    clientId: op0,
                    created: true,
                    entityId: op0,
                    entityType: testCase.entityType,
                    fields: testCase.input,
                    opIndex: 0,
                    replayed: false,
                    updatedAt,
                },
            ]);
        });

        test(`${testCase.tool} resend reads back on "already exists"`, async () => {
            const linear = fakeLinear({
                Create: () => linearError('INPUT_ERROR', 'Entity with id already exists'),
                Read: () => data({ [testCase.read]: { id: op0, updatedAt } }),
            });
            const { report, result } = await callTool(linear, testCase.tool, testCase.args);
            expect(result.isError).toBe(false);
            expect(linear.requests[1]?.query).toContain(`${testCase.read}(id: $id)`);
            expect(report.mutations[0]).toMatchObject({ entityId: op0, replayed: true });
        });
    }
});

test('a name collision "already exists" surfaces Linear\'s refusal, not a replay', async () => {
    const linear = fakeLinear({
        Create: () =>
            linearError('INPUT_ERROR', 'duplicate', 'A label with this name already exists.'),
        Read: () => data({ issueLabel: null }),
    });
    const { report, result } = await callTool(linear, 'create_label', { name: 'Print ready' });
    expect(result.content[0]?.text).toBe(
        'linear_input_error: A label with this name already exists.'
    );
    expect(report.mutations).toEqual([]);
});

describe('workflow states', () => {
    const state = { id: op0, name: 'Design Review', position: 2, type: 'started', updatedAt };

    test('create_workflow_state defaults the color by type', async () => {
        const linear = fakeLinear({
            Create: () => data({ workflowStateCreate: { success: true, workflowState: state } }),
        });
        const { result } = await callTool(linear, 'create_workflow_state', {
            name: 'Design Review',
            position: 2,
            team: teamId,
            type: 'started',
        });
        expect(linear.requests[0]?.variables.input).toEqual({
            color: '#f2c94c',
            id: op0,
            name: 'Design Review',
            position: 2,
            teamId,
            type: 'started',
        });
        expect(result.structuredContent.workflowState).toMatchObject({ name: 'Design Review' });
    });

    test('update_workflow_state reorders and records the changed fields', async () => {
        const linear = fakeLinear({
            UpdateWorkflowState: () =>
                data({ workflowStateUpdate: { success: true, workflowState: state } }),
        });
        const { report } = await callTool(linear, 'update_workflow_state', {
            name: 'In Review',
            position: 1.5,
            state: op0,
        });
        expect(linear.requests[0]?.variables).toEqual({
            id: op0,
            input: { name: 'In Review', position: 1.5 },
        });
        expect(report.mutations[0]).toMatchObject({
            created: false,
            entityType: 'workflow_state',
            fields: { name: 'In Review', position: 1.5 },
        });
    });

    test("archive_workflow_state surfaces Linear's refusal for a state in use", async () => {
        const linear = fakeLinear({
            ArchiveWorkflowState: () =>
                linearError(
                    'INPUT_ERROR',
                    'Cannot archive state',
                    'The state contains active issues. Move them first.'
                ),
        });
        const { report, result } = await callTool(linear, 'archive_workflow_state', {
            state: op0,
        });
        expect(result.content[0]?.text).toBe(
            'linear_input_error: The state contains active issues. Move them first.'
        );
        expect(report).toEqual({ completed: false, mutations: [] });
    });

    test('archive_workflow_state records the archive', async () => {
        const linear = fakeLinear({
            ArchiveWorkflowState: () =>
                data({ workflowStateArchive: { entity: { id: op0, updatedAt }, success: true } }),
        });
        const { report, result } = await callTool(linear, 'archive_workflow_state', {
            state: op0,
        });
        expect(result.structuredContent).toEqual({ archived: true, workflowStateId: op0 });
        expect(report.mutations[0]).toMatchObject({ fields: { archived: true }, updatedAt });
    });
});
