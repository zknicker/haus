import type {
    ServerMember,
    SetHumanTimezoneInput,
    SyncHumanIdentityInput,
    UpdateHumanProfileInput,
} from '@haus/api';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { violatesConstraint } from '../postgres/constraint-violation.ts';
import { serverMembershipsTable, usersTable } from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';
import {
    ParticipantHandleTakenError,
    participantHandleConstraint,
    suggestAvailableParticipantHandle,
} from './participant-handles.ts';
import { requireServerMembership } from './server-access.ts';
import { lockServerRow } from './server-lock.ts';

/**
 * Seeds a human's profile from the Clerk identity and device zone the App
 * reports. It only fills blanks: once a human has chosen a display name or a
 * timezone it is theirs, and a later sign-in must not overwrite it. Every App
 * load syncs, so this reports whether it wrote anything: an unchanged identity
 * must not wake every member's App.
 */
export async function syncHumanIdentity(
    db: HausDatabase,
    member: HausUser | null,
    input: SyncHumanIdentityInput
): Promise<boolean> {
    if (!member) {
        throw new Error('Signing in is required to sync a human profile.');
    }

    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await requireServerMembership(tx, member, input.serverId);
        const [existing] = await tx
            .select({
                displayName: usersTable.displayName,
                email: usersTable.email,
                handle: serverMembershipsTable.handle,
                timezone: usersTable.timezone,
            })
            .from(serverMembershipsTable)
            .innerJoin(usersTable, eq(usersTable.id, serverMembershipsTable.userId))
            .where(
                and(
                    eq(serverMembershipsTable.serverId, input.serverId),
                    eq(serverMembershipsTable.userId, member.id),
                    isNull(serverMembershipsTable.revokedAt)
                )
            )
            .limit(1);

        if (!existing) {
            return false;
        }

        const filledName = existing.displayName ?? input.name?.trim() ?? null;
        const displayName = filledName && filledName.length > 0 ? filledName : null;
        const email = input.email?.trim() || null;
        const fillsTimezone = Boolean(input.timezone) && existing.timezone === null;
        if (
            displayName === existing.displayName &&
            email === existing.email &&
            existing.handle !== null &&
            !fillsTimezone
        ) {
            return false;
        }
        const handle =
            existing.handle ??
            (await suggestAvailableParticipantHandle(
                tx,
                input.serverId,
                displayName,
                input.email?.split('@')[0]
            ));

        await tx
            .update(usersTable)
            .set({
                displayName,
                email,
                // Fill only a blank in this statement: a zone the human sets
                // while this sync runs must survive it.
                ...(input.timezone
                    ? { timezone: sql`coalesce(${usersTable.timezone}, ${input.timezone})` }
                    : {}),
            })
            .where(eq(usersTable.id, member.id));
        await tx
            .update(serverMembershipsTable)
            .set({ handle })
            .where(
                and(
                    eq(serverMembershipsTable.serverId, input.serverId),
                    eq(serverMembershipsTable.userId, member.id),
                    isNull(serverMembershipsTable.revokedAt)
                )
            );
        return true;
    });
}

/** A human edits only their own profile. */
export async function updateHumanProfile(
    db: HausDatabase,
    member: HausUser | null,
    input: UpdateHumanProfileInput
): Promise<void> {
    if (!member) {
        throw new Error('Signing in is required to edit a human profile.');
    }

    try {
        await db.transaction(async (tx) => {
            await lockServerRow(tx, input.serverId);
            await requireServerMembership(tx, member, input.serverId);
            await tx
                .update(usersTable)
                .set({ description: input.description, displayName: input.displayName })
                .where(eq(usersTable.id, member.id));
            if (input.handle) {
                await tx
                    .update(serverMembershipsTable)
                    .set({ handle: input.handle })
                    .where(
                        and(
                            eq(serverMembershipsTable.serverId, input.serverId),
                            eq(serverMembershipsTable.userId, member.id),
                            isNull(serverMembershipsTable.revokedAt)
                        )
                    );
            }
        });
    } catch (cause) {
        if (
            violatesConstraint(cause, participantHandleConstraint) ||
            violatesConstraint(cause, 'server_memberships_server_handle_key')
        ) {
            throw new ParticipantHandleTakenError(input.handle ?? '');
        }
        throw cause;
    }
}

/** A human sets their own timezone; it applies on every Server they belong to. */
export async function setHumanTimezone(
    db: HausDatabase,
    member: HausUser | null,
    input: SetHumanTimezoneInput
): Promise<void> {
    if (!member) {
        throw new Error('Signing in is required to set a timezone.');
    }

    await db.transaction(async (tx) => {
        await requireServerMembership(tx, member, input.serverId);
        await tx
            .update(usersTable)
            .set({ timezone: input.timezone })
            .where(eq(usersTable.id, member.id));
    });
}

export function humanMemberLabel(member: Pick<ServerMember, 'displayName' | 'userId'>): string {
    return member.displayName ?? `Human ${member.userId.slice(-6)}`;
}
