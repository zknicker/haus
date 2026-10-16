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
    /** The step's title in its status: a done step names what is done. */
    title: string;
}

/**
 * The flow's steps, exactly one of them current. Registering is done once
 * the Owner has been to Linear (`registered`) or the credentials are saved;
 * the credentials are done once saved, for a draft that still installs. A
 * secret rotation (`installing` false) has no install step and always lands
 * on the credentials. `editing` reopens a done step, and every step after
 * it waits again.
 */
export function linearIdentityFlowSteps(input: {
    credentialsSaved: boolean;
    editing: LinearIdentityFlowStepId | null;
    installing: boolean;
    mode: LinearIdentityFlowMode;
    registered: boolean;
}): LinearIdentityFlowStep[] {
    const ids: LinearIdentityFlowStepId[] = input.installing
        ? ['register', 'credentials', 'install']
        : ['register', 'credentials'];
    const done: Record<LinearIdentityFlowStepId, boolean> = {
        credentials: input.installing && input.credentialsSaved,
        install: false,
        register: input.registered || input.credentialsSaved,
    };
    const current = input.editing ?? ids.find((id) => !done[id]) ?? 'credentials';
    const currentIndex = ids.indexOf(current);

    return ids.map((id, index) => {
        const status: LinearIdentityFlowStepStatus =
            index === currentIndex ? 'current' : index < currentIndex ? 'done' : 'upcoming';
        return { id, status, title: stepTitle(id, status, input.mode) };
    });
}

function stepTitle(
    id: LinearIdentityFlowStepId,
    status: LinearIdentityFlowStepStatus,
    mode: LinearIdentityFlowMode
) {
    const doneStatus = status === 'done';
    switch (id) {
        case 'register':
            if (mode === 'create') {
                return doneStatus ? 'Created in Linear' : 'Create the app in Linear';
            }
            return doneStatus ? 'App settings checked' : "Check the app's settings";
        case 'credentials':
            return doneStatus ? 'Credentials saved' : 'Paste its client ID and webhook secret';
        default:
            return 'Install it in Linear';
    }
}

/**
 * What the register step says. Creating opens Linear's page pre-filled from
 * the Server's manifest; the values stay as a fallback to check or copy.
 * Linear issues the client id and webhook secret only on its page.
 */
export function linearIdentityRegisterHint(
    draft: Pick<LinearIdentityDraft, 'createAppPrefillsWebhook'>,
    mode: LinearIdentityFlowMode
): string {
    if (mode === 'existing') {
        return 'Open the app in Linear and make sure its callback URL, webhook URL, and events match these. Its client ID and webhook secret are there too.';
    }
    return draft.createAppPrefillsWebhook
        ? 'Linear opens with the app filled in. Create it, then come back for its client ID and webhook secret.'
        : 'Linear opens with the name and callback URL filled in. This Server has no public HTTPS address, so add the app icon and webhook below yourself.';
}

/**
 * Whether the values to copy start shown. A pre-filled create needs them only
 * as a fallback, so they wait behind a toggle; every other path copies or
 * checks them by hand.
 */
export function linearIdentityValuesShown(
    draft: Pick<LinearIdentityDraft, 'createAppPrefillsWebhook'>,
    mode: LinearIdentityFlowMode
): boolean {
    return mode === 'existing' || !draft.createAppPrefillsWebhook;
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

/**
 * One value for Linear's new-app form: text to copy, checkboxes to tick
 * (named, nothing to copy), or the app icon (the Agent's avatar), which
 * Linear's form takes as an upload and so is saved as an image.
 */
export type LinearIdentityFlowValue =
    | { kind: 'copy'; label: string; value: string }
    | { kind: 'download'; label: string; url: string }
    | { kind: 'labels'; label: string; values: string[] };

/**
 * The values to enter in Linear, in the order its form asks for them. A
 * check of an existing app needs only the URLs and events; its name and
 * avatar are already the Owner's choice. The manifest pre-fills the avatar
 * whenever it pre-fills the webhook, so the avatar is listed only when the
 * Owner adds both by hand.
 */
export function linearIdentityFlowValues(
    draft: LinearIdentityDraft,
    mode: LinearIdentityFlowMode
): LinearIdentityFlowValue[] {
    const urls: LinearIdentityFlowValue[] = [
        { kind: 'copy', label: 'Callback URL', value: draft.callbackUrl },
        { kind: 'copy', label: 'Webhook URL', value: draft.webhookUrl },
        {
            kind: 'labels',
            label: 'Webhook events',
            values: draft.webhookEvents.map((event) => webhookEventLabels[event]),
        },
    ];
    if (mode === 'existing') {
        return urls;
    }
    const avatar: LinearIdentityFlowValue[] =
        draft.avatarUrl && !draft.createAppPrefillsWebhook
            ? [{ kind: 'download', label: 'App icon', url: draft.avatarUrl }]
            : [];
    return [{ kind: 'copy', label: 'App name', value: draft.appName }, ...avatar, ...urls];
}
