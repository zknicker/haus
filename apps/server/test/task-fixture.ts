import { createHausClient, type HausClient } from './haus-client.ts';
import type { HausServerHarness } from './haus-server-harness.ts';

/** People and Agents for the Task tests. */
export function taskFixture(harness: HausServerHarness) {
    const signIn = async (subject: string): Promise<HausClient> =>
        createHausClient(harness, await harness.humans.mintSessionToken(subject));

    return {
        /** Inserts a non-retired Agent on the Server. */
        async addAgent(serverId: string, agentId: string, handle: string) {
            await harness.sql`
                insert into agents (id, server_id, handle, display_name, home_timezone)
                values (${agentId}, ${serverId}, ${handle}, 'Agent', 'America/New_York')
            `;
        },
        /** Signs a person in and makes them a Member of the Server (no Channel participation). */
        async addMember(serverId: string, subject: string) {
            const client = await signIn(subject);
            await client.trpc.server.create.mutate({
                displayName: `${subject} Root`,
                slug: `${subject.replaceAll('_', '-')}-root`,
            });
            const [user] = (await harness.sql`
                select id from users where auth_subject = ${subject}
            `) as { id: string }[];
            if (!user) {
                throw new Error(`No user for ${subject}.`);
            }
            await harness.sql`
                insert into server_memberships (id, server_id, user_id, role)
                values (${`mem_${subject}`}, ${serverId}, ${user.id}, 'member')
            `;
            return { client, userId: user.id };
        },
        signIn,
    };
}
