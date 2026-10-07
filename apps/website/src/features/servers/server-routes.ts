/** Haus servers are addressed by their immutable slug. */
export const serversRoute = '/s';

export function serverRoute(slug: string) {
    return `${serversRoute}/${slug}`;
}

export function serverSearchRoute(slug: string, query?: string) {
    const route = `${serverRoute(slug)}/search`;
    return query ? `${route}?q=${encodeURIComponent(query)}` : route;
}

export function serverChatRoute(slug: string, chatId: string) {
    return `${serverRoute(slug)}/chats/${encodeURIComponent(chatId)}`;
}

/** A Chat with one of its Threads open beside it, by the Thread's anchor message. */
export function serverChatThreadRoute(slug: string, chatId: string, anchorMessageId: string) {
    return `${serverChatRoute(slug, chatId)}?thread=${encodeURIComponent(anchorMessageId)}`;
}

export function serverAgentDmRoute(slug: string, agentId: string) {
    return `${serverRoute(slug)}/dm/${encodeURIComponent(agentId)}`;
}

export function serverArchivedChatsRoute(slug: string) {
    return `${serverRoute(slug)}/archived`;
}

/** The human Inbox: one lens over what needs this person right now. */
export function inboxRoute(slug: string) {
    return `${serverRoute(slug)}/inbox`;
}

export function activityRoute(slug: string) {
    return `${serverRoute(slug)}/activity`;
}

export function tasksRoute(slug: string) {
    return `${serverRoute(slug)}/tasks`;
}

/**
 * Server-wide token usage, a Settings section so the settings rail stays put
 * while you read it.
 *
 * Every scope the dashboard reads back off the URL is a filter here, so an
 * Agent, a Computer, and a runtime are all built the same way.
 */
export function usageRoute(
    slug: string,
    filters: { agentId?: string; computerId?: string; runtimeId?: string } = {}
) {
    const query = new URLSearchParams();
    if (filters.agentId) {
        query.set('agent', filters.agentId);
    }
    if (filters.computerId) {
        query.set('computer', filters.computerId);
    }
    if (filters.runtimeId) {
        query.set('runtime', filters.runtimeId);
    }
    const suffix = query.toString();
    return `${serverSettingsRoute(slug)}/usage${suffix ? `?${suffix}` : ''}`;
}

/** Computers live as a Settings section; the legacy /computers path redirects here. */
export function serverComputersRoute(slug: string) {
    return `${serverSettingsRoute(slug)}/computers`;
}

export function serverSettingsRoute(slug: string) {
    return `${serverRoute(slug)}/settings`;
}

/**
 * An Agent's own page, outside Settings. Agents are first-class product
 * records, so their profile renders in the Server layout rather than as a
 * Members row inside the settings rail. The last segment is the profile
 * section (ADR 0038), `home` being the hub; retired tab names still resolve,
 * because the route redirects them to their section.
 */
export function agentProfileRoute(slug: string, agentId: string, section = 'home') {
    return `${serverRoute(slug)}/agents/${encodeURIComponent(agentId)}/${section}`;
}

/**
 * A human's detail inside Settings. The Members directory is a settings
 * section, so opening one of its rows stays in Settings rather than handing the
 * reader to the members browser and replacing the whole navigation rail.
 */
export function settingsHumanRoute(slug: string, userId: string) {
    return `${serverSettingsSectionRoute(slug, 'members')}/humans/${encodeURIComponent(userId)}`;
}

/** One MCP connection's page, a record inside Settings → Connections. */
export function settingsConnectionRoute(slug: string, connectionId: string) {
    return `${serverSettingsSectionRoute(slug, 'connections')}/${encodeURIComponent(connectionId)}`;
}

export function serverSettingsSectionRoute(slug: string, section: string) {
    return `${serverSettingsRoute(slug)}/${section}`;
}

/**
 * Invitations live outside `/s/:slug` on purpose: a Server address may itself
 * be `join` or `invite`, so nesting the token under the slug branch would be
 * genuinely ambiguous.
 */
export function invitationRoute(token: string) {
    return `/invite/${token}`;
}

export function invitationLink(token: string, appOrigin = hausAppOrigin()) {
    return appLink(invitationRoute(token), appOrigin);
}

/** An absolute App URL, for a link a human copies somewhere outside Haus. */
export function appLink(route: string, appOrigin = hausAppOrigin()) {
    return new URL(route, appOrigin).toString();
}

function hausAppOrigin() {
    const configured = import.meta.env.VITE_HAUS_APP_ORIGIN;

    if (configured) {
        return configured;
    }

    if (window.location.origin !== 'null') {
        return window.location.origin;
    }

    throw new Error(
        'VITE_HAUS_APP_ORIGIN is required to create absolute App links in the desktop App.'
    );
}
