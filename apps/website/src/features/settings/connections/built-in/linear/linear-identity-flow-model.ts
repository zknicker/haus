import type { LinearIdentityDraft, LinearIdentityWebhookEvent } from '@haus/api';

/**
 * The guided identity flow (specs/linear-app.md#agent-identities): create the
 * app in Linear (or check an existing one), paste its client id and webhook
 * secret, then install. `existing` skips creation but shows the same values to
 * check against the app's settings.
 */
export type LinearIdentityFlowMode = 'create' | 'existing';

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

const credentialMaxLength = 200;

/** Both pasted values are required and bounded the way the Server checks them. */
export function linearIdentityCredentialsReady(clientId: string, webhookSigningSecret: string) {
    return [clientId, webhookSigningSecret].every((value) => {
        const trimmed = value.trim();
        return trimmed.length > 0 && trimmed.length <= credentialMaxLength;
    });
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
