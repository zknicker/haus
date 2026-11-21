export function idleCompactionGate() {
    const servers = new Map<string, string>();
    let enabled = new Set<string>();
    return {
        allows: (agentId: string) => enabled.has(servers.get(agentId) ?? ''),
        started(agentId: string, serverId: string) {
            servers.set(agentId, serverId);
        },
        update(serverIds: readonly string[]) {
            enabled = new Set(serverIds);
        },
    };
}
