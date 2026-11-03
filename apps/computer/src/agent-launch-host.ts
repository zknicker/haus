import { randomBytes } from 'node:crypto';
import type { CloudAgentWorkSupervisor } from './cloud-agents/work-runner.ts';
import { type LoopbackProxy, startLoopbackProxy } from './proxy.ts';

interface AgentLaunchHost {
    proxy: LoopbackProxy;
    proxyToken: string;
}

const launchHosts = new Map<string, AgentLaunchHost>();

export function acquireAgentLaunchHost(input: {
    agentId: string;
    cloudAgents?: CloudAgentWorkSupervisor;
    dataRoot: string;
    runnerToken: string;
    runId: string;
    serverId: string;
    serverOrigin: string;
    skillsDir: string;
}): AgentLaunchHost {
    const key = hostKey(input.serverId, input.agentId);
    const current = launchHosts.get(key);
    if (current) {
        current.proxy.setRunnerToken(input.runnerToken);
        current.proxy.setRunId(input.runId);
        current.proxy.resetSendCount();
        return current;
    }
    const proxyToken = `grta_${randomBytes(32).toString('base64url')}`;
    const created = {
        proxy: startLoopbackProxy({
            agentId: input.agentId,
            cloudAgents: input.cloudAgents,
            dataRoot: input.dataRoot,
            proxyToken,
            runnerToken: input.runnerToken,
            runId: input.runId,
            serverId: input.serverId,
            serverOrigin: input.serverOrigin,
            skillsDir: input.skillsDir,
        }),
        proxyToken,
    };
    launchHosts.set(key, created);
    return created;
}

/**
 * A turn the runtime started on its own is running with no run: its `haus` calls wait up to
 * `ms` for the wake run the Computer asked the Server for. No host means no such turn exists.
 */
export function holdAgentLaunchHostForWake(serverId: string, agentId: string, ms: number): void {
    launchHosts.get(hostKey(serverId, agentId))?.proxy.holdForRunner(ms);
}

/** Ends the Computer-local execution host for an Agent reset or retirement. */
export function disposeAgentLaunchHost(serverId: string, agentId: string): void {
    const key = hostKey(serverId, agentId);
    launchHosts.get(key)?.proxy.close();
    launchHosts.delete(key);
}

export function disposeServerLaunchHosts(serverId: string): void {
    for (const [key, host] of launchHosts) {
        if (key.startsWith(`${serverId}:`)) {
            host.proxy.close();
            launchHosts.delete(key);
        }
    }
}

function hostKey(serverId: string, agentId: string): string {
    return `${serverId}:${agentId}`;
}
