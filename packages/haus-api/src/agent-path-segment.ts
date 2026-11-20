const agentPathSegmentPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

export function agentPathSegment(agentId: string) {
    if (!agentPathSegmentPattern.test(agentId)) {
        throw new Error(`${JSON.stringify(agentId)} is not an Agent id that can name a directory.`);
    }
    return agentId;
}
