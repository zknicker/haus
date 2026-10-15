import * as z from 'zod';
import { confirmed, definedFields, recordUpdate } from '../call-context.ts';
import { defineTool, flatten, linearIdArg, teamArg } from '../tool.ts';
import { inputError } from '../tool-error.ts';
import { resolveTeamId } from './linear-refs.ts';
import { workflowStateFields } from './workspace-reads.ts';
import { colorArg, createEntity } from './workspace-writes.ts';

const stateTypes = ['triage', 'backlog', 'unstarted', 'started', 'completed', 'canceled'] as const;
type StateType = (typeof stateTypes)[number];

/** Linear's own palette per state type, used when no color is given. */
const defaultColors: Record<StateType, string> = {
    backlog: '#bec2c8',
    canceled: '#95a2b3',
    completed: '#5e6ad2',
    started: '#f2c94c',
    triage: '#fc7840',
    unstarted: '#e2e2e2',
};

const positionArg = z
    .number()
    .min(-1_000_000)
    .max(1_000_000)
    .describe('Board order; lower is left.');
const stateArg = linearIdArg.describe('Workflow state id.');

interface StateEntity {
    id: string;
    updatedAt: string;
}

export const createWorkflowState = defineTool({
    name: 'create_workflow_state',
    description: "Add a workflow state (a board column) to a team's workflow.",
    input: z
        .object({
            color: colorArg.optional(),
            description: z.string().max(500).optional(),
            name: z.string().trim().min(1).max(80),
            position: positionArg.optional(),
            team: teamArg,
            type: z.enum(stateTypes),
        })
        .strict(),
    readOnly: false,
    async run(context, input) {
        const fields = definedFields({
            color: input.color ?? defaultColors[input.type],
            description: input.description,
            name: input.name,
            position: input.position,
            teamId: await resolveTeamId(context, input.team),
            type: input.type,
        });
        const state = await createEntity(context, {
            entityType: 'workflow_state',
            fields,
            inputType: 'WorkflowStateCreateInput',
            mutation: 'workflowStateCreate',
            readQuery: 'workflowState',
            resultKey: 'workflowState',
            selection: `${workflowStateFields} updatedAt`,
        });
        return { workflowState: flatten(state) };
    },
});

export const updateWorkflowState = defineTool({
    name: 'update_workflow_state',
    description: 'Rename, recolor, describe, or reorder a workflow state.',
    input: z
        .object({
            color: colorArg.optional(),
            description: z.string().max(500).optional(),
            name: z.string().trim().min(1).max(80).optional(),
            position: positionArg.optional(),
            state: stateArg,
        })
        .strict(),
    readOnly: false,
    async run(context, input) {
        const fields = definedFields({
            color: input.color,
            description: input.description,
            name: input.name,
            position: input.position,
        });
        if (Object.keys(fields).length === 0) {
            throw inputError('Name at least one change.');
        }
        const data = await context.linear.request<{
            workflowStateUpdate: { success: boolean; workflowState: StateEntity | null };
        }>(
            `mutation UpdateWorkflowState($id: String!, $input: WorkflowStateUpdateInput!) {
                workflowStateUpdate(id: $id, input: $input) {
                    success workflowState { ${workflowStateFields} updatedAt }
                }
            }`,
            { id: input.state, input: fields }
        );
        const state = confirmed<StateEntity>(data.workflowStateUpdate, 'workflowState');
        if (!state) {
            throw inputError('Linear did not return the workflow state.');
        }
        recordUpdate(context, { entity: state, entityType: 'workflow_state', fields, opIndex: 0 });
        return { workflowState: flatten(state) };
    },
});

export const archiveWorkflowState = defineTool({
    name: 'archive_workflow_state',
    description: 'Archive a workflow state. Linear refuses while issues still use it.',
    input: z.object({ state: stateArg }).strict(),
    readOnly: false,
    async run(context, input) {
        const data = await context.linear.request<{
            workflowStateArchive: { success: boolean; entity: StateEntity | null };
        }>(
            `mutation ArchiveWorkflowState($id: String!) {
                workflowStateArchive(id: $id) { success entity { id updatedAt } }
            }`,
            { id: input.state }
        );
        const state = confirmed<StateEntity>(data.workflowStateArchive, 'entity') ?? {
            id: input.state,
            updatedAt: null,
        };
        const fields = { archived: true };
        recordUpdate(context, { entity: state, entityType: 'workflow_state', fields, opIndex: 0 });
        return { archived: true, workflowStateId: state.id };
    },
});
