import { linearActivityTypeSchema } from '@haus/api';
import * as z from 'zod';
import { confirmed, createOnce, definedFields } from '../call-context.ts';
import { defineTool } from '../tool.ts';

interface ActivityEntity {
    id: string;
    updatedAt: string;
}

export const reply = defineTool({
    name: 'reply',
    description:
        'Answer the Linear session named in your event input (session=lss_…); never guess a current one. Post a thought or action while working, a response when done (it completes the session), or an elicitation to ask.',
    input: z
        .object({
            body: z
                .string()
                .trim()
                .min(1)
                .max(20_000)
                .describe('Markdown; for an action, the action name.'),
            parameter: z.string().max(2000).optional().describe('Action only: what it acted on.'),
            result: z.string().max(20_000).optional().describe('Action only: the outcome.'),
            session: z.string().regex(/^lss_[A-Za-z0-9_-]{16}$/u),
            type: linearActivityTypeSchema,
        })
        .strict(),
    readOnly: false,
    async run(context, input) {
        const session = context.meta.session;
        if (!session) {
            throw new Error('Linear session is missing from the request.');
        }
        const content =
            input.type === 'action'
                ? definedFields({
                      action: input.body,
                      parameter: input.parameter ?? '',
                      result: input.result,
                      type: 'action',
                  })
                : { body: input.body, type: input.type };
        const fields = { agentSessionId: session.linearSessionId, content };
        const activity = await createOnce<ActivityEntity>(context, {
            entityType: 'agent_activity',
            fields,
            opIndex: 0,
            async create(id) {
                const data = await context.linear.request<{
                    agentActivityCreate: { success: boolean; agentActivity: ActivityEntity | null };
                }>(
                    `mutation Reply($input: AgentActivityCreateInput!) {
                        agentActivityCreate(input: $input) { success agentActivity { id updatedAt } }
                    }`,
                    { input: { ...fields, id } }
                );
                return confirmed<ActivityEntity>(data.agentActivityCreate, 'agentActivity');
            },
            async readBack(id) {
                const data = await context.linear.request<{ agentActivity: ActivityEntity | null }>(
                    'query Activity($id: String!) { agentActivity(id: $id) { id updatedAt } }',
                    { id }
                );
                return data.agentActivity;
            },
        });
        return { activityId: activity.id, session: input.session, type: input.type };
    },
});

export const whoami = defineTool({
    name: 'whoami',
    description:
        'Your Linear identity here: how your writes appear (your own identity, or your name via Haus) and the workspace url key, which haus trigger create --workspace takes.',
    input: z.object({}).strict(),
    readOnly: true,
    async run(context) {
        const data = await context.linear.request<{
            organization: { name: string; urlKey: string };
            viewer: { displayName: string };
        }>('query Whoami { organization { name urlKey } viewer { displayName } }');
        const identityHandle = context.meta.self?.identityHandle ?? null;
        const name = context.meta.actor.createAsUser;
        return {
            hasIdentity: identityHandle !== null,
            handle: identityHandle ?? data.viewer.displayName,
            postsAs:
                identityHandle === null && name
                    ? `${name} (via ${data.viewer.displayName})`
                    : `@${identityHandle ?? data.viewer.displayName}`,
            workspace: data.organization,
        };
    },
});
