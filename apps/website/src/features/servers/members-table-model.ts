import type {
    ServerInvitation,
    ServerMember,
    ServerMemberDirectory,
    ServerRole,
} from '@haus/api/membership';
import { humanDisplayName } from './human-identity.ts';

export const memberRoleFilters = [
    { id: 'all', label: 'All roles' },
    { id: 'owner', label: 'Owner' },
    { id: 'admin', label: 'Admin' },
    { id: 'member', label: 'Member' },
    { id: 'pending', label: 'Pending' },
] as const satisfies ReadonlyArray<{ id: 'all' | 'pending' | ServerRole; label: string }>;

export type MemberRoleFilter = (typeof memberRoleFilters)[number]['id'];

export type MemberRow =
    | {
          email: string | null;
          id: string;
          isViewer: boolean;
          kind: 'member';
          member: ServerMember;
          name: string;
          since: string;
          status: ServerRole;
      }
    | {
          email: string;
          id: string;
          invitation: ServerInvitation;
          kind: 'invitation';
          name: string;
          status: 'pending';
      };

export function buildMemberRows({
    directory,
    invitations,
    query,
    role,
}: {
    directory: ServerMemberDirectory;
    invitations: readonly ServerInvitation[];
    query: string;
    role: MemberRoleFilter;
}) {
    const members = directory.members
        .map(
            (member) =>
                ({
                    email: member.email,
                    id: `member:${member.userId}`,
                    isViewer: member.userId === directory.viewerUserId,
                    kind: 'member',
                    member,
                    name: humanDisplayName(member),
                    since: member.joinedAt,
                    status: member.role,
                }) satisfies MemberRow
        )
        .sort(
            (left, right) =>
                rank[left.member.role] - rank[right.member.role] ||
                left.name.localeCompare(right.name)
        );
    const pending = invitations
        .filter((invitation) => invitation.status === 'pending')
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .map(
            (invitation) =>
                ({
                    email: invitation.email,
                    id: `invitation:${invitation.id}`,
                    invitation,
                    kind: 'invitation',
                    name: invitation.email,
                    status: 'pending',
                }) satisfies MemberRow
        );
    const needle = query.trim().toLowerCase();
    const rows: MemberRow[] = [...members, ...pending];
    return rows.filter(
        (row) => (role === 'all' || row.status === role) && matchesQuery(row, needle)
    );
}

const rank: Record<ServerRole, number> = { admin: 1, member: 2, owner: 0 };

function matchesQuery(row: MemberRow, needle: string) {
    if (needle.length === 0) {
        return true;
    }
    const handle = row.kind === 'member' ? (row.member.handle ?? '') : '';
    return [row.name, row.email ?? '', handle].some((value) =>
        value.toLowerCase().includes(needle)
    );
}
