import type { ServerMember } from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import type { HausUser } from '../users/haus-user.ts';
import {
    findCurrentMembership,
    ServerMemberNotFoundError,
    toServerMember,
} from './member-access.ts';
import { requireServerMembership } from './server-access.ts';

/** One current human member, readable by any other current Server member. */
export async function getServerMember(
    db: HausDatabase,
    viewer: HausUser | null,
    serverId: string,
    userId: string
): Promise<ServerMember> {
    await requireServerMembership(db, viewer, serverId);
    const member = await findCurrentMembership(db, serverId, userId);

    if (!member) {
        throw new ServerMemberNotFoundError();
    }

    return toServerMember(member);
}
