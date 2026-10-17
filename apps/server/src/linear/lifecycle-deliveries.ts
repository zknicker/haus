import type { AgentWake } from '../built-in-connections/built-in-connection.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    type LinearCredential,
    markCredentialAtGeneration,
    readActorCredential,
} from './credentials.ts';
import type { LinearDeliveryHandler, LinearDeliveryRow } from './delivery-handler.ts';
import { credentialFailed } from './lifecycle.ts';
import { type LinearTeamReach, readLinearTeams } from './linear-install-reads.ts';
import { orphanLinearSessions } from './sessions.ts';
import { applyLinearTeamAccess } from './team-sync.ts';
import { prepareLinearWorkspaceUpdated } from './workspace-updated.ts';

export interface LinearLifecycleDeliveryDependencies {
    /** A valid access token for the credential (the binding slice's refresher). */
    accessToken(credentialId: string): Promise<string>;
    db: HausDatabase;
    fetch: typeof fetch;
}

/**
 * `OAuthApp` revoked and `PermissionChange` deliveries
 * (specs/linear-app.md#lifecycle, #team-scope), applied with the binding
 * slice's state machines. A revocation moves the receiving actor's credential
 * to `revoked` and its workspace or identity with it; an identity leaving
 * `active` orphans its sessions. A permission change re-reads the receiver's
 * teams before the transaction, replaces its access, and gives newly
 * accessible teams pending Agent labels. Both announce `linear.onUpdated`
 * after commit, so an open Linear page shows the new teams or status.
 */
export function linearLifecycleHandler(
    dependencies: LinearLifecycleDeliveryDependencies
): LinearDeliveryHandler<LinearTeamReach[] | null> {
    return {
        apply: async (tx, row, now, teams) => {
            const credential = await receiverCredential(tx, row);
            if (!credential) {
                return { kind: 'ignored', reason: 'workspace_inactive' };
            }
            if (row.event === 'OAuthApp') {
                if (row.action !== 'revoked') {
                    return { kind: 'ignored', reason: 'unsupported_event' };
                }
                const wakes = await revoke(tx, credential, now);
                return { announce: await announced(tx, row), kind: 'done', routed: 0, wakes };
            }
            if (!teams) {
                return { kind: 'ignored', reason: 'unsupported_event' };
            }
            const wakes = await applyLinearTeamAccess(tx, credential, teams, now);
            return { announce: await announced(tx, row), kind: 'done', routed: 0, wakes };
        },
        prepare: async (row) => {
            if (row.event !== 'PermissionChange') {
                return null;
            }
            const credential = await receiverCredential(null, row);
            if (!credential || credential.state !== 'valid') {
                return null;
            }
            return await readLinearTeams(
                dependencies.fetch,
                await dependencies.accessToken(credential.id)
            );
        },
    };

    async function receiverCredential(
        tx: HausDatabase | null,
        row: LinearDeliveryRow
    ): Promise<LinearCredential | null> {
        return await readActorCredential(tx ?? dependencies.db, {
            identityId: row.receiver === 'app' ? null : row.receiver,
            workspaceId: row.workspaceId,
        });
    }
}

async function announced(tx: HausDatabase, row: LinearDeliveryRow) {
    const event = await prepareLinearWorkspaceUpdated(tx, row);
    return event ? [event] : [];
}

async function revoke(
    tx: HausDatabase,
    credential: LinearCredential,
    now: Date
): Promise<AgentWake[]> {
    if (credential.state === 'revoked') {
        return [];
    }
    const revoked = await markCredentialAtGeneration(tx, {
        credentialId: credential.id,
        generation: credential.generation,
        now,
        state: 'revoked',
    });
    if (!revoked) {
        return [];
    }
    const wakes = await credentialFailed(tx, revoked, now);
    if (revoked.identityId) {
        await orphanLinearSessions(tx, {
            identityId: revoked.identityId,
            now,
            serverId: revoked.serverId,
        });
    }
    return wakes;
}
