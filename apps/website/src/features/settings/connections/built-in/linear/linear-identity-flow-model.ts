import type { LinearIdentity, LinearIdentityDraft, LinearIdentityWebhookEvent } from '@haus/api';

/**
 * The guided identity flow (specs/linear-app.md#agent-identities): create the
 * app in Linear (or check an existing one), paste its client id and webhook
 * secret, then install. `existing` skips creation but shows the same values to
 * check against the app's settings.
 */
export type LinearIdentityFlowMode = 'create' | 'existing';

/**
 * Which flow a roster action opens. Once credentials are saved the app
 * exists, so resuming never offers to create it again; a secret rotation
 * checks the existing app's settings.
 */
export function linearIdentityFlowMode(
    action: 'connect-existing' | 'continue' | 'give' | 'rotate-secret',
    identity: Pick<LinearIdentity, 'credentialsSaved'> | null
): LinearIdentityFlowMode {
    switch (action) {
        case 'give':
            return 'create';
        case 'continue':
            return identity?.credentialsSaved ? 'existing' : 'create';
        default:
            return 'existing';
    }
}

export type LinearIdentityFlowStepId = 'credentials' | 'install' | 'register';
export type LinearIdentityFlowStepStatus = 'current' | 'done' | 'upcoming';

export interface LinearIdentityFlowStep {
    id: LinearIdentityFlowStepId;
    status: LinearIdentityFlowStepStatus;
    title: string;
}

/** Copying and pasting happen together, so both are current until the save lands. */
export function linearIdentityFlowSteps(input: {
    credentialsSaved: boolean;
    draftReady: boolean;
    mode: LinearIdentityFlowMode;
}): LinearIdentityFlowStep[] {
    const before: LinearIdentityFlowStepStatus = input.credentialsSaved
        ? 'done'
        : input.draftReady
          ? 'current'
          : 'upcoming';
    return [
        {
            id: 'register',
            status: before,
            title:
                input.mode === 'create' ? 'Create the app in Linear' : "Check the app's settings",
        },
        { id: 'credentials', status: before, title: 'Paste its credentials' },
        {
            id: 'install',
            status: input.credentialsSaved ? 'current' : 'upcoming',
            title: 'Install it',
        },
    ];
}

/**
 * What the register step says. Creating opens Linear's page pre-filled from
 * the Server's manifest; the values below stay as a fallback to check or copy.
 * Linear issues the client id and webhook secret only on its page.
 */
export function linearIdentityRegisterHint(
    draft: Pick<LinearIdentityDraft, 'createAppPrefillsWebhook'>,
    mode: LinearIdentityFlowMode
): string {
    if (mode === 'existing') {
        return "Make sure the app's callback URL, webhook URL, and events match these.";
    }
    return draft.createAppPrefillsWebhook
        ? 'Linear opens with everything below filled in. Create the app, then copy its client ID and webhook signing secret back here.'
        : 'Linear opens with the name and callback URL filled in. This Server has no public HTTPS address, so add the webhook URL and events yourself, then copy the client ID and webhook signing secret back here.';
}

const credentialMaxLength = 200;

/** The client id field is editable only while the identity is a `draft`. */
export function linearIdentityClientIdEditable(identity: Pick<LinearIdentity, 'status'>) {
    return identity.status === 'draft';
}

/**
 * What Save sends, or null when the pasted values cannot save. The webhook
 * secret is always required (a save with only it rotates the secret); the
 * client id is required until one is saved, and only a `draft` takes a new one.
 * Both are bounded the way the Server checks them.
 */
export function linearIdentityCredentialsInput(
    identity: Pick<LinearIdentity, 'credentialsSaved' | 'status'>,
    values: { clientId: string; webhookSigningSecret: string }
): { clientId?: string; webhookSigningSecret: string } | null {
    const clientId = values.clientId.trim();
    const webhookSigningSecret = values.webhookSigningSecret.trim();
    if (!withinBounds(webhookSigningSecret)) {
        return null;
    }
    if (clientId.length === 0) {
        return identity.credentialsSaved ? { webhookSigningSecret } : null;
    }
    return withinBounds(clientId) && linearIdentityClientIdEditable(identity)
        ? { clientId, webhookSigningSecret }
        : null;
}

function withinBounds(value: string) {
    return value.length > 0 && value.length <= credentialMaxLength;
}

const webhookEventLabels: Record<LinearIdentityWebhookEvent, string> = {
    agent_session_events: 'Agent session events',
    oauth_app_revoked: 'OAuth app revoked',
    permission_changes: 'Permission changes',
};

export interface LinearIdentityFlowValue {
    label: string;
    value: string;
}

/**
 * The values to copy into Linear, in the order its form asks for them. A
 * check of an existing app needs only the URLs and events; its name and
 * avatar are already the Owner's choice.
 */
export function linearIdentityFlowValues(
    draft: LinearIdentityDraft,
    mode: LinearIdentityFlowMode
): LinearIdentityFlowValue[] {
    const events = draft.webhookEvents.map((event) => webhookEventLabels[event]).join(', ');
    const urls = [
        { label: 'Callback URL', value: draft.callbackUrl },
        { label: 'Webhook URL', value: draft.webhookUrl },
        { label: 'Webhook events', value: events },
    ];
    if (mode === 'existing') {
        return urls;
    }
    return [
        { label: 'App name', value: draft.appName },
        ...(draft.avatarUrl ? [{ label: 'Avatar', value: draft.avatarUrl }] : []),
        ...urls,
    ];
}
