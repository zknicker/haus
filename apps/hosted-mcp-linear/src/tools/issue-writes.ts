import * as z from 'zod';
import {
    attribution,
    confirmed,
    createOnce,
    definedFields,
    recordUpdate,
} from '../call-context.ts';
import { defineTool, flatten, issueArg, linearIdArg, teamArg } from '../tool.ts';
import { inputError } from '../tool-error.ts';
import { createComment } from './comment-create.ts';
import { issueSummaryFields, readIssue } from './issue-reads.ts';
import { resolveIssueId, resolveTeamId } from './linear-refs.ts';

interface IssueEntity {
    id: string;
    updatedAt: string;
}

const priorityArg = z
    .number()
    .int()
    .min(0)
    .max(4)
    .describe('0 none, 1 urgent, 2 high, 3 medium, 4 low.');
const dueDateArg = z.iso.date().describe('YYYY-MM-DD.');
const labelIdsArg = z.array(linearIdArg).max(25);
const noteArg = z
    .string()
    .trim()
    .min(1)
    .max(10_000)
    .describe('Posted as your comment on the issue, explaining the change.');

export const createIssue = defineTool({
    name: 'create_issue',
    description:
        'Create a Linear issue in a team. Use ids from the list tools for state, labels, and project.',
    input: z
        .object({
            assignee: linearIdArg.optional().describe('User id.'),
            description: z.string().max(100_000).optional().describe('Markdown.'),
            dueDate: dueDateArg.optional(),
            estimate: z.number().min(0).max(1000).optional(),
            labels: labelIdsArg.optional().describe('Label ids.'),
            parent: issueArg.optional(),
            priority: priorityArg.optional(),
            project: linearIdArg.optional().describe('Project id.'),
            state: linearIdArg.optional().describe('Workflow state id.'),
            team: teamArg,
            title: z.string().trim().min(1).max(255),
        })
        .strict(),
    readOnly: false,
    async run(context, input) {
        const fields = definedFields({
            assigneeId: input.assignee,
            description: input.description,
            dueDate: input.dueDate,
            estimate: input.estimate,
            labelIds: input.labels,
            parentId: input.parent ? await resolveIssueId(context, input.parent) : undefined,
            priority: input.priority,
            projectId: input.project,
            stateId: input.state,
            teamId: await resolveTeamId(context, input.team),
            title: input.title,
        });
        const issue = await createOnce<IssueEntity>(context, {
            entityType: 'issue',
            fields,
            opIndex: 0,
            async create(id) {
                const data = await context.linear.request<{
                    issueCreate: { success: boolean; issue: IssueEntity | null };
                }>(
                    `mutation CreateIssue($input: IssueCreateInput!) {
                        issueCreate(input: $input) { success issue { ${issueSummaryFields} } }
                    }`,
                    { input: { ...fields, ...attribution(context.meta), id } }
                );
                return confirmed<IssueEntity>(data.issueCreate, 'issue');
            },
            async readBack(id) {
                return (await readIssue(context.linear, id)) as unknown as IssueEntity;
            },
        });
        return { issue: flatten(issue) };
    },
});

export const updateIssue = defineTool({
    name: 'update_issue',
    description:
        'Change an issue: state, labels, priority, project, estimate, or due date. Add a note to explain the change as a comment.',
    input: z
        .object({
            addLabels: labelIdsArg.optional().describe('Label ids to add.'),
            dueDate: dueDateArg.nullable().optional(),
            estimate: z.number().min(0).max(1000).nullable().optional(),
            issue: issueArg,
            labels: labelIdsArg.optional().describe('Replaces every label.'),
            note: noteArg.optional(),
            priority: priorityArg.optional(),
            project: linearIdArg.nullable().optional().describe('Project id; null removes it.'),
            removeLabels: labelIdsArg.optional().describe('Label ids to remove.'),
            state: linearIdArg.optional().describe('Workflow state id.'),
        })
        .strict(),
    readOnly: false,
    async run(context, input) {
        const fields = definedFields({
            addedLabelIds: input.addLabels,
            dueDate: input.dueDate,
            estimate: input.estimate,
            labelIds: input.labels,
            priority: input.priority,
            projectId: input.project,
            removedLabelIds: input.removeLabels,
            stateId: input.state,
        });
        if (Object.keys(fields).length === 0 && !input.note) {
            throw inputError('Name at least one change or a note.');
        }
        let issue: IssueEntity | null = null;
        if (Object.keys(fields).length > 0) {
            const data = await context.linear.request<{
                issueUpdate: { success: boolean; issue: IssueEntity | null };
            }>(
                `mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
                    issueUpdate(id: $id, input: $input) { success issue { ${issueSummaryFields} } }
                }`,
                { id: input.issue, input: fields }
            );
            issue = confirmed<IssueEntity>(data.issueUpdate, 'issue');
            if (!issue) {
                throw inputError('Linear did not return the issue.');
            }
            recordUpdate(context, { entity: issue, entityType: 'issue', fields, opIndex: 0 });
        }
        const issueId = issue?.id ?? (await resolveIssueId(context, input.issue));
        const note = input.note
            ? await createComment(context, { body: input.note, issueId, opIndex: 1 })
            : null;
        return {
            ...(issue ? { issue: flatten(issue) } : {}),
            ...(note ? { note: flatten(note) } : {}),
        };
    },
});

export const createCommentTool = defineTool({
    name: 'create_comment',
    description: 'Comment on a Linear issue, or reply to a comment.',
    input: z
        .object({
            body: z.string().trim().min(1).max(50_000).describe('Markdown.'),
            issue: issueArg,
            parent: linearIdArg.optional().describe('Comment id to reply to.'),
        })
        .strict(),
    readOnly: false,
    async run(context, input) {
        const comment = await createComment(context, {
            body: input.body,
            issueId: await resolveIssueId(context, input.issue),
            opIndex: 0,
            parentId: input.parent,
        });
        return { comment: flatten(comment) };
    },
});

export const delegateIssue = defineTool({
    name: 'delegate_issue',
    description:
        "Hand an issue to another Haus Agent: sets its Agent label and makes it the issue's delegate.",
    input: z
        .object({
            agent: z
                .string()
                .regex(/^agt_[A-Za-z0-9_-]{16}$/u)
                .describe('Haus Agent id.'),
            issue: issueArg,
        })
        .strict(),
    readOnly: false,
    async run(context, input) {
        const delegation = context.meta.delegation;
        if (!delegation) {
            throw new Error('Linear delegation target is missing from the request.');
        }
        const current = await context.linear.request<{
            issue: {
                id: string;
                labels: { nodes: { id: string; parent: { id: string } | null }[] };
            } | null;
        }>(
            'query IssueLabels($id: String!) { issue(id: $id) { id labels { nodes { id parent { id } } } } }',
            { id: input.issue }
        );
        if (!current.issue) {
            throw inputError('Issue not found.');
        }
        const kept = current.issue.labels.nodes
            .filter(
                (label) =>
                    label.id !== delegation.labelId &&
                    (delegation.labelGroupId === null ||
                        label.parent?.id !== delegation.labelGroupId)
            )
            .map((label) => label.id);
        const fields = {
            delegateId: delegation.delegateId,
            labelIds: delegation.labelId ? [...kept, delegation.labelId] : kept,
        };
        const data = await context.linear.request<{
            issueUpdate: { success: boolean; issue: IssueEntity | null };
        }>(
            `mutation DelegateIssue($id: String!, $input: IssueUpdateInput!) {
                issueUpdate(id: $id, input: $input) { success issue { ${issueSummaryFields} } }
            }`,
            { id: current.issue.id, input: fields }
        );
        const issue = confirmed<IssueEntity>(data.issueUpdate, 'issue');
        if (!issue) {
            throw inputError('Linear did not return the issue.');
        }
        recordUpdate(context, { entity: issue, entityType: 'issue', fields, opIndex: 0 });
        return { issue: flatten(issue) };
    },
});
