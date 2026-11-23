import type { AgentCoAuthors } from '@haus/api';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { serverMembershipsTable, usersTable } from '../postgres/schema.ts';

export async function readCoAuthors(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    people: readonly string[]
) {
    const handles = [...new Set(people.map((person) => person.toLowerCase()))];
    const members = await db
        .select({
            displayName: usersTable.displayName,
            email: usersTable.email,
            handle: sql<string>`lower(${serverMembershipsTable.handle})`,
        })
        .from(serverMembershipsTable)
        .innerJoin(usersTable, eq(usersTable.id, serverMembershipsTable.userId))
        .where(
            and(
                eq(serverMembershipsTable.serverId, serverId),
                isNull(serverMembershipsTable.revokedAt),
                inArray(sql`lower(${serverMembershipsTable.handle})`, handles)
            )
        );
    const found = new Map(members.map((member) => [member.handle, member]));
    const answer: AgentCoAuthors = { coAuthors: [], missing: [] };
    for (const handle of handles) {
        const member = found.get(handle);
        if (!member) {
            answer.missing.push({ handle, reason: 'unknown' });
        } else if (member.email) {
            const name = member.displayName?.trim() || handle;
            answer.coAuthors.push({ handle, trailer: `Co-authored-by: ${name} <${member.email}>` });
        } else {
            answer.missing.push({ handle, reason: 'no-email' });
        }
    }
    return answer;
}
