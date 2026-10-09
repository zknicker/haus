import type { HausDatabase } from '../../postgres/connection.ts';
import { memberUpdatedTopic } from '../../realtime/topics.ts';
import { listAccessibleServers } from '../../servers/accessible-servers.ts';
import type { HausUser } from '../../users/haus-user.ts';

/**
 * Announces a profile change after it has committed. One human has one profile
 * shared by every Server they belong to, while a handle belongs to one
 * membership. Each accessible Server hears the profile refresh; the edited
 * Server also receives its handle change through that same event shape. A
 * caller without a signed-in human never wrote anything, so it announces nothing.
 */
export async function announceHumanProfileChange(
    db: HausDatabase,
    member: HausUser | null
): Promise<void> {
    if (!member) {
        return;
    }

    for (const server of await listAccessibleServers(db, member.id)) {
        memberUpdatedTopic.announce({ memberId: member.id, serverId: server.id });
    }
}
