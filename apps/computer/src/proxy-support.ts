import type { AgentInboxLocation, VisibleMessageIdentity } from './inbox-store.ts';
import { attestVisibleMessages } from './visibility-receipt.ts';

export async function awaitBestEffortAttestation(
    serverOrigin: string,
    runnerToken: string,
    messages: VisibleMessageIdentity[]
): Promise<void> {
    await Promise.race([
        attestVisibleMessages(serverOrigin, runnerToken, messages),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 250)),
    ]);
}

export function agentInboxLocation(input: {
    agentId?: string;
    dataRoot?: string;
    serverId?: string;
}): AgentInboxLocation | null {
    return input.agentId && input.dataRoot && input.serverId
        ? { agentId: input.agentId, dataRoot: input.dataRoot, serverId: input.serverId }
        : null;
}

export function isAuthorized(request: Request, proxyToken: string): boolean {
    return request.headers.get('authorization') === `Bearer ${proxyToken}`;
}
