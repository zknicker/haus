import {
    requiresSlugConfirmation,
    resolveServerMemberAuthority,
    type ServerMember,
    type ServerMemberAction,
    type ServerMemberDirectory,
    type ServerRole,
} from '@haus/api/membership';
import { humanDisplayName } from './human-identity.ts';

export type ServerMemberActionKind =
    | 'demote-member'
    | 'grant-owner'
    | 'leave'
    | 'promote-admin'
    | 'remove'
    | 'revoke-owner';

export interface ServerMemberRowAction {
    /** Set when the Server would refuse; the row explains rather than hides. */
    disabledReason: string | null;
    kind: ServerMemberActionKind;
    label: string;
    nextRole: ServerRole | null;
    requiresSlug: boolean;
}

interface ActionCandidate {
    action: ServerMemberAction;
    kind: ServerMemberActionKind;
    label: string;
}

/**
 * Which management actions this viewer is offered on one member row, decided by
 * the same rule the Server enforces. Actions the viewer simply lacks authority
 * for are omitted rather than shown disabled — a Member does not need a list of
 * things they cannot do. The last-Owner protection is the exception: it is a
 * Server invariant rather than a missing permission, so it stays visible with
 * its reason.
 */
export function serverMemberRowActions(
    directory: ServerMemberDirectory,
    target: ServerMember
): ServerMemberRowAction[] {
    const targetIsLastOwner = isLastOwner(directory, target);

    return candidatesFor(directory, target).flatMap((candidate) => {
        const decision = resolveServerMemberAuthority({
            action: candidate.action,
            actorRole: directory.viewerRole,
            actorUserId: directory.viewerUserId,
            targetIsLastOwner,
            targetRole: target.role,
            targetUserId: target.userId,
        });

        if (decision.allowed) {
            return [toRowAction(candidate, target.role, null)];
        }

        if (decision.reason === 'last-owner') {
            return [
                toRowAction(
                    candidate,
                    target.role,
                    "This Server's last Owner cannot be removed, demoted, or leave."
                ),
            ];
        }

        return [];
    });
}

/**
 * What the confirmation says will happen. Hosted Users have no display profile,
 * so every description names the human by their short id and states the role at
 * stake — a dialog that says only "Remove from Server" cannot be checked
 * against the row the human meant to act on.
 */
export function memberChangeDescription(
    target: ServerMember,
    action: ServerMemberRowAction,
    slug: string
): string {
    const who = humanDisplayName(target);

    if (action.kind === 'leave') {
        return `You are the ${target.role} ${who}. You will lose access to /${slug} immediately, and rejoining needs a fresh invitation. Messages you wrote stay.`;
    }

    if (action.kind === 'remove') {
        return `${who} is currently ${target.role}. They lose access to /${slug} immediately, and their Channel memberships and read markers are cleared. Messages they wrote stay.`;
    }

    return `${who} goes from ${target.role} to ${action.nextRole ?? target.role} on /${slug}.`;
}

export function isLastOwner(directory: ServerMemberDirectory, target: ServerMember): boolean {
    return (
        target.role === 'owner' &&
        directory.members.filter((entry) => entry.role === 'owner').length === 1
    );
}

function candidatesFor(directory: ServerMemberDirectory, target: ServerMember): ActionCandidate[] {
    const isSelf = target.userId === directory.viewerUserId;
    const candidates: ActionCandidate[] = [];

    if (target.role === 'member') {
        candidates.push({
            action: { kind: 'changeRole', nextRole: 'admin' },
            kind: 'promote-admin',
            label: 'Make Admin',
        });
    }

    if (target.role === 'admin') {
        candidates.push({
            action: { kind: 'changeRole', nextRole: 'member' },
            kind: 'demote-member',
            label: 'Make Member',
        });
    }

    if (target.role === 'owner') {
        candidates.push({
            action: { kind: 'changeRole', nextRole: 'admin' },
            kind: 'revoke-owner',
            label: 'Revoke Owner',
        });
    } else {
        candidates.push({
            action: { kind: 'changeRole', nextRole: 'owner' },
            kind: 'grant-owner',
            label: 'Make Owner',
        });
    }

    candidates.push(
        isSelf
            ? { action: { kind: 'leave' }, kind: 'leave', label: 'Leave Server' }
            : { action: { kind: 'remove' }, kind: 'remove', label: 'Remove from Server' }
    );

    return candidates;
}

function toRowAction(
    candidate: ActionCandidate,
    targetRole: ServerRole,
    disabledReason: string | null
): ServerMemberRowAction {
    return {
        disabledReason,
        kind: candidate.kind,
        label: candidate.label,
        nextRole: candidate.action.kind === 'changeRole' ? candidate.action.nextRole : null,
        requiresSlug: requiresSlugConfirmation(candidate.action, targetRole),
    };
}
