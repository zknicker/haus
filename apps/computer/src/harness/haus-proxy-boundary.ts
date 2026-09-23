import type { ComputerAgentActivityCategory } from '../agent-activity.ts';

/** Maps a structured Haus local-proxy request to the activity it proves, if any. */
export function classifyHausProxyBoundary(
    method: string,
    pathname: string
): ComputerAgentActivityCategory | null {
    if (
        (method === 'GET' &&
            (pathname === '/api/agent/events' ||
                pathname === '/api/agent/history' ||
                pathname === '/api/agent/messages/search' ||
                /^\/api\/agent\/messages\/[^/]+$/u.test(pathname))) ||
        (method === 'POST' && pathname === '/api/agent/messages/search')
    ) {
        return 'checking_messages';
    }
    if (/^\/api\/agent\/browser(?:\/|$)/u.test(pathname)) {
        return 'browsing';
    }
    return null;
}
