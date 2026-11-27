import { serverAgentDmRoute } from '../servers/server-routes.ts';

export function captainChatRoute(slug: string, agentId: string) {
    return serverAgentDmRoute(slug, agentId);
}
