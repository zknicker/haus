import * as z from 'zod';
import { confirmed, createOnce, definedFields, type LinearCallContext } from '../call-context.ts';
import { defineTool, flatten, linearIdArg, teamArg } from '../tool.ts';
import { resolveTeamId } from './linear-refs.ts';

interface Entity {
    id: string;
    updatedAt: string;
}

export const colorArg = z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/u)
    .describe('Hex color, such as #5E6AD2.');

const projectFields =
    'id name description url status { name type } teams { nodes { id key } } updatedAt';
const documentFields = 'id title url updatedAt project { id name }';
const labelFields =
    'id name color description isGroup parent { id name } team { id key } updatedAt';

export const createProject = defineTool({
    name: 'create_project',
    description: 'Create a Linear project for one or more teams.',
    input: z
        .object({
            content: z.string().max(100_000).optional().describe('Markdown project brief.'),
            description: z.string().max(255).optional().describe('One-line summary.'),
            name: z.string().trim().min(1).max(80),
            teams: z.array(teamArg).min(1).max(10),
        })
        .strict(),
    readOnly: false,
    async run(context, input) {
        const teamIds: string[] = [];
        for (const team of input.teams) {
            teamIds.push(await resolveTeamId(context, team));
        }
        const fields = definedFields({
            content: input.content,
            description: input.description,
            name: input.name,
            teamIds,
        });
        const project = await createEntity(context, {
            entityType: 'project',
            fields,
            mutation: 'projectCreate',
            inputType: 'ProjectCreateInput',
            readQuery: 'project',
            resultKey: 'project',
            selection: projectFields,
        });
        return { project: flatten(project) };
    },
});

export const createDocument = defineTool({
    name: 'create_document',
    description: 'Create a Linear document, optionally inside a project.',
    input: z
        .object({
            content: z.string().max(500_000).optional().describe('Markdown.'),
            project: linearIdArg.optional().describe('Project id.'),
            title: z.string().trim().min(1).max(255),
        })
        .strict(),
    readOnly: false,
    async run(context, input) {
        const fields = definedFields({
            content: input.content,
            projectId: input.project,
            title: input.title,
        });
        const document = await createEntity(context, {
            entityType: 'document',
            fields,
            mutation: 'documentCreate',
            inputType: 'DocumentCreateInput',
            readQuery: 'document',
            resultKey: 'document',
            selection: documentFields,
        });
        return { document: flatten(document) };
    },
});

export const createLabel = defineTool({
    name: 'create_label',
    description: 'Create an issue label in a team, or a workspace label when no team is given.',
    input: z
        .object({
            color: colorArg.optional(),
            description: z.string().max(500).optional(),
            name: z.string().trim().min(1).max(80),
            parent: linearIdArg.optional().describe('Label group id.'),
            team: teamArg.optional(),
        })
        .strict(),
    readOnly: false,
    async run(context, input) {
        const fields = definedFields({
            color: input.color,
            description: input.description,
            name: input.name,
            parentId: input.parent,
            teamId: input.team ? await resolveTeamId(context, input.team) : undefined,
        });
        const label = await createEntity(context, {
            entityType: 'label',
            fields,
            mutation: 'issueLabelCreate',
            inputType: 'IssueLabelCreateInput',
            readQuery: 'issueLabel',
            resultKey: 'issueLabel',
            selection: labelFields,
        });
        return { label: flatten(label) };
    },
});

/** A single-create tool: `<mutation>(input: { ...fields, id })`, read back by `<readQuery>(id)`. */
export async function createEntity(
    context: LinearCallContext,
    options: {
        entityType: 'document' | 'label' | 'project' | 'workflow_state';
        fields: Record<string, unknown>;
        inputType: string;
        mutation: string;
        readQuery: string;
        resultKey: string;
        selection: string;
    }
): Promise<Entity> {
    return await createOnce<Entity>(context, {
        entityType: options.entityType,
        fields: options.fields,
        opIndex: 0,
        async create(id) {
            const data = await context.linear.request<
                Record<string, { success: boolean } & Record<string, unknown>>
            >(
                `mutation Create($input: ${options.inputType}!) {
                    ${options.mutation}(input: $input) { success ${options.resultKey} { ${options.selection} } }
                }`,
                { input: { ...options.fields, id } }
            );
            const payload = data[options.mutation];
            if (!payload) {
                throw new Error(`Linear omitted ${options.mutation}.`);
            }
            return confirmed<Entity>(payload, options.resultKey);
        },
        async readBack(id) {
            const data = await context.linear.request<Record<string, Entity | null>>(
                `query Read($id: String!) { ${options.readQuery}(id: $id) { ${options.selection} } }`,
                { id }
            );
            return data[options.readQuery] ?? null;
        },
    });
}
