import { serverRoute } from '../servers/server-routes.ts';

export function captainChatRoute(slug: string, agentId: string) {
    return `${serverRoute(slug)}/captain/${encodeURIComponent(agentId)}`;
}
