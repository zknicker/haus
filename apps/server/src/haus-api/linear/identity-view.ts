import type { LinearIdentity, LinearIdentityDraft } from '@haus/api';
import { and, eq, isNotNull, ne } from 'drizzle-orm';
import { absoluteAvatarUrlFor } from '../../avatars/avatar-url.ts';
import {
    linearAppsUrl,
    linearCreateAppUrl,
    linearIdentityAppManifest,
} from '../../linear/identity-app-manifest.ts';
import type { LinearApp } from '../../linear/linear-api.ts';
import { linearOauthCallbackPath } from '../../linear/oauth-callback-route.ts';
import type { HausDatabase } from '../../postgres/connection.ts';
import {
    agentsTable,
    linearCredentialsTable,
    linearIdentitiesTable,
    linearIdentitySecretsTable,
    linearTeamAccessTable,
} from '../../postgres/schema.ts';

// The Linear page's identity read model: state plus the guided flow's
// pre-filled values, readable again until the identity is removed.

const identityWebhookEvents: LinearIdentityDraft['webhookEvents'] = [
    'agent_session_events',
    'permission_changes',
    'oauth_app_revoked',
];

/** The connection's live identities, oldest first. */
export async function listLinearIdentities(
    db: HausDatabase,
    app: Pick<LinearApp, 'publicOrigin'>,
    workspace: { id: string; urlKey: string }
): Promise<LinearIdentity[]> {
    const rows = await db
        .select({
            agent: { avatarId: agentsTable.avatarId, displayName: agentsTable.displayName },
            identity: linearIdentitiesTable,
            secretSaved: linearIdentitySecretsTable.identityId,
        })
        .from(linearIdentitiesTable)
        .innerJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, linearIdentitiesTable.serverId),
                eq(agentsTable.id, linearIdentitiesTable.agentId)
            )
        )
        .leftJoin(
            linearIdentitySecretsTable,
            eq(linearIdentitySecretsTable.identityId, linearIdentitiesTable.id)
        )
        .where(
            and(
                eq(linearIdentitiesTable.workspaceId, workspace.id),
                ne(linearIdentitiesTable.status, 'removed')
            )
        )
        .orderBy(linearIdentitiesTable.createdAt);
    const memberTeamIds = await identityMemberTeamIds(db, workspace.id);
    return rows.map(({ agent, identity, secretSaved }) => ({
        agentId: identity.agentId,
        credentialsSaved: identity.oauthClientId !== null && secretSaved !== null,
        guidedFlow: identityGuidedFlow(app, workspace, { ...agent, identityId: identity.id }),
        handle: identity.handle,
        id: identity.id,
        lastDeliveryAt: identity.lastDeliveryAt?.toISOString() ?? null,
        memberTeamIds: memberTeamIds.get(identity.id) ?? [],
        status: identity.status,
        workspaceId: identity.workspaceId,
    }));
}

/**
 * Every value the Owner copies into Linear's new-application form, and the
 * deep link that opens that form pre-filled with them.
 */
export function identityGuidedFlow(
    app: Pick<LinearApp, 'publicOrigin'>,
    workspace: { urlKey: string },
    identity: { avatarId: string | null; displayName: string; identityId: string }
): LinearIdentityDraft {
    const avatarUrl = absoluteAvatarUrlFor(identity.avatarId, app.publicOrigin);
    const callbackUrl = `${app.publicOrigin}${linearOauthCallbackPath}`;
    const webhookUrl = `${app.publicOrigin}/api/linear/webhook/${encodeURIComponent(identity.identityId)}`;
    const manifest = linearIdentityAppManifest({
        agentName: identity.displayName,
        avatarUrl,
        callbackUrl,
        publicOrigin: app.publicOrigin,
        webhookEvents: identityWebhookEvents,
        webhookUrl,
    });
    return {
        appName: manifest.oauth.client_name,
        appsUrl: linearAppsUrl(workspace.urlKey),
        avatarUrl,
        callbackUrl,
        createAppPrefillsWebhook: manifest.webhook !== undefined,
        createAppUrl: linearCreateAppUrl(workspace.urlKey, manifest),
        identityId: identity.identityId,
        webhookEvents: identityWebhookEvents,
        webhookUrl,
    };
}

/** Identity id → the teams its credential's app user is a member of, as of the last sync. */
async function identityMemberTeamIds(
    db: HausDatabase,
    workspaceId: string
): Promise<Map<string, string[]>> {
    const rows = await db
        .select({
            identityId: linearCredentialsTable.identityId,
            teamId: linearTeamAccessTable.teamId,
        })
        .from(linearTeamAccessTable)
        .innerJoin(
            linearCredentialsTable,
            eq(linearCredentialsTable.id, linearTeamAccessTable.credentialId)
        )
        .where(
            and(
                eq(linearCredentialsTable.workspaceId, workspaceId),
                isNotNull(linearCredentialsTable.identityId),
                eq(linearTeamAccessTable.member, true)
            )
        )
        .orderBy(linearTeamAccessTable.teamName);
    const byIdentity = new Map<string, string[]>();
    for (const row of rows) {
        if (row.identityId) {
            byIdentity.set(row.identityId, [...(byIdentity.get(row.identityId) ?? []), row.teamId]);
        }
    }
    return byIdentity;
}
