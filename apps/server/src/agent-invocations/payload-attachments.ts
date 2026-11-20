import { sql } from 'drizzle-orm';
import { agentInvocationPayloadsTable, attachmentsTable } from '../postgres/schema.ts';

export const notInvocationPayload = sql`not exists (
    select 1 from ${agentInvocationPayloadsTable}
    where ${agentInvocationPayloadsTable.serverId} = ${attachmentsTable.serverId}
        and ${agentInvocationPayloadsTable.attachmentId} = ${attachmentsTable.id}
)`;
