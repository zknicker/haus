import type { LinearIdentity, LinearIdentityDraft } from '@haus/api';
import { and, eq, ne } from 'drizzle-orm';
import { absoluteAvatarUrlFor } from '../../avatars/avatar-url.ts';
import {
    linearCreateAppUrl,
    linearIdentityAppManifest,
} from '../../linear/identity-app-manifest.ts';
import type { LinearApp } from '../../linear/linear-api.ts';
import { linearOauthCallbackPath } from '../../linear/oauth-callback-route.ts';
import type { HausDatabase } from '../../postgres/connection.ts';
import {
    agentsTable,
    linearIdentitiesTable,
    linearIdentitySecretsTable,
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
    return rows.map(({ agent, identity, secretSaved }) => ({
        agentId: identity.agentId,
        credentialsSaved: identity.oauthClientId !== null && secretSaved !== null,
        guidedFlow: identityGuidedFlow(app, workspace, { ...agent, identityId: identity.id }),
        handle: identity.handle,
        id: identity.id,
        lastDeliveryAt: identity.lastDeliveryAt?.toISOString() ?? null,
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
        avatarUrl,
        callbackUrl,
        createAppPrefillsWebhook: manifest.webhook !== undefined,
        createAppUrl: linearCreateAppUrl(workspace.urlKey, manifest),
        identityId: identity.identityId,
        webhookEvents: identityWebhookEvents,
        webhookUrl,
    };
}
