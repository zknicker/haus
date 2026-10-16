import type { LinearIdentityWebhookEvent } from '@haus/api';

// Linear's OAuth app manifest pre-fills its new-application page
// (https://linear.app/developers/oauth-app-manifests). Linear still issues the
// client id and webhook signing secret only on that page, so the Owner copies
// those two back by hand.

export interface LinearAppManifest {
    developer: { name: string };
    display?: { iconUrl: string };
    distribution: 'private';
    oauth: {
        client_name: string;
        client_uri: string;
        grant_types: ['authorization_code'];
        redirect_uris: [string];
    };
    schemaVersion: '1.0.0';
    webhook?: {
        enabled: true;
        resourceTypes: LinearWebhookResourceType[];
        url: string;
    };
}

/** Linear's webhook resource type for each event an identity app needs. */
export type LinearWebhookResourceType =
    | 'AgentSessionEvent'
    | 'OAuthAuthorization'
    | 'PermissionChange';

const resourceTypes: Record<LinearIdentityWebhookEvent, LinearWebhookResourceType> = {
    agent_session_events: 'AgentSessionEvent',
    oauth_app_revoked: 'OAuthAuthorization',
    permission_changes: 'PermissionChange',
};

/**
 * The manifest for one identity's private app. Without a public HTTPS origin
 * (a dev stack without a Funnel) Linear can neither deliver webhooks nor fetch
 * the icon, so both are left for the Owner to fill in from the copied values.
 */
export function linearIdentityAppManifest(input: {
    agentName: string;
    avatarUrl: null | string;
    callbackUrl: string;
    publicOrigin: string;
    webhookEvents: readonly LinearIdentityWebhookEvent[];
    webhookUrl: string;
}): LinearAppManifest {
    const reachable = linearCanReachOrigin(input.publicOrigin);
    return {
        schemaVersion: '1.0.0',
        distribution: 'private',
        ...(reachable && input.avatarUrl ? { display: { iconUrl: input.avatarUrl } } : {}),
        developer: { name: 'Haus' },
        oauth: {
            client_name: linearClientName(input.agentName),
            client_uri: input.publicOrigin,
            grant_types: ['authorization_code'],
            redirect_uris: [input.callbackUrl],
        },
        ...(reachable
            ? {
                  webhook: {
                      enabled: true,
                      resourceTypes: [...new Set(input.webhookEvents.map((e) => resourceTypes[e]))],
                      url: input.webhookUrl,
                  },
              }
            : {}),
    };
}

/** Linear's new-application page for a workspace, pre-filled from the manifest. */
export function linearCreateAppUrl(urlKey: string, manifest: LinearAppManifest): string {
    const url = new URL(
        `https://linear.app/${encodeURIComponent(urlKey)}/settings/api/applications/new`
    );
    url.searchParams.set('manifest', JSON.stringify(manifest));
    return url.toString();
}

const clientNameMin = 2;
const clientNameMax = 80;
const forbiddenClientNameText = /linear|https?:\/\//giu;

/**
 * The Agent's name made acceptable as Linear's `client_name`: 2–80 characters
 * with no "Linear" and no URL scheme. Forbidden text is removed until none is
 * left (removal can join new matches), then a too-short name gains " (Haus)".
 */
export function linearClientName(agentName: string): string {
    let name = agentName;
    let previous = '';
    while (name !== previous) {
        previous = name;
        name = name.replace(forbiddenClientNameText, '');
    }
    name = name.replace(/\s+/gu, ' ').trim();
    if ([...name].length < clientNameMin) {
        name = name ? `${name} (Haus)` : 'Haus Agent';
    }
    return [...name].slice(0, clientNameMax).join('').trimEnd();
}

/**
 * Whether Linear can call this origin: HTTPS on a public host. Loopback,
 * private-network, and linear.app hosts are refused by Linear's webhook rules.
 */
export function linearCanReachOrigin(origin: string): boolean {
    let url: URL;
    try {
        url = new URL(origin);
    } catch {
        return false;
    }
    if (url.protocol !== 'https:') {
        return false;
    }
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/gu, '');
    return !(
        host === 'localhost' ||
        host.endsWith('.localhost') ||
        host === 'linear.app' ||
        host.endsWith('.linear.app') ||
        isPrivateIpv4(host) ||
        isPrivateIpv6(host)
    );
}

function isPrivateIpv4(host: string): boolean {
    const parts = host.split('.');
    if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/u.test(part))) {
        return false;
    }
    const [a = 0, b = 0] = parts.map(Number);
    return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168)
    );
}

function isPrivateIpv6(host: string): boolean {
    if (!host.includes(':')) {
        return false;
    }
    return host === '::' || host === '::1' || /^f[cd]/u.test(host) || /^fe[89ab]/u.test(host);
}
