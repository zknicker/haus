import type { WorkerTurnInput } from '@haus/api';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, serverMembershipsTable } from '../postgres/schema.ts';
import { workerInstructions } from './worker-instructions.ts';

export async function composeWorkerInput(
    db: Pick<HausDatabase, 'select'>,
    input: { inputs: readonly WorkerTurnInput[]; serverId: string; taskKey: string }
) {
    const handles = await readAuthorHandles(db, input.serverId, input.inputs);
    const sections = input.inputs.map((turnInput) => {
        const handle = handles.get(turnInput.author.id);
        const author = handle ? `@${handle}` : 'a teammate';
        const label = turnInput.kind === 'brief' ? 'Brief' : 'Follow-up';
        return `## ${label} from ${author}\n\n${turnInput.text}`;
    });
    return [workerInstructions(input.taskKey), ...sections].join('\n\n');
}

async function readAuthorHandles(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    inputs: readonly WorkerTurnInput[]
) {
    const agentIds = authorIds(inputs, 'agent');
    const userIds = authorIds(inputs, 'user');
    const agents =
        agentIds.length > 0
            ? await db
                  .select({ handle: agentsTable.handle, id: agentsTable.id })
                  .from(agentsTable)
                  .where(and(eq(agentsTable.serverId, serverId), inArray(agentsTable.id, agentIds)))
            : [];
    const users =
        userIds.length > 0
            ? await db
                  .select({
                      handle: serverMembershipsTable.handle,
                      id: serverMembershipsTable.userId,
                  })
                  .from(serverMembershipsTable)
                  .where(
                      and(
                          eq(serverMembershipsTable.serverId, serverId),
                          inArray(serverMembershipsTable.userId, userIds),
                          isNotNull(serverMembershipsTable.handle)
                      )
                  )
            : [];
    return new Map([...agents, ...users].map(({ handle, id }) => [id, handle]));
}

function authorIds(inputs: readonly WorkerTurnInput[], kind: 'agent' | 'user') {
    return [
        ...new Set(
            inputs
                .filter((turnInput) => turnInput.author.kind === kind)
                .map(({ author }) => author.id)
        ),
    ];
}
