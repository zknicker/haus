import type { Agent } from '@haus/api';

export function createAgentHandle(name: string, agents: readonly Pick<Agent, 'handle'>[]) {
    const normalized =
        name
            .normalize('NFKD')
            .toLowerCase()
            .replace(/[^a-z0-9]+/gu, '-')
            .replace(/^-+|-+$/gu, '')
            .slice(0, 31) || 'agent';
    const base = normalized.length === 1 ? `${normalized}-agent` : normalized;
    const taken = new Set(agents.map((agent) => agent.handle));

    if (!taken.has(base)) {
        return base;
    }
    for (let suffix = 2; suffix < 10_000; suffix += 1) {
        const suffixText = `-${suffix}`;
        const candidate = `${base.slice(0, 31 - suffixText.length)}${suffixText}`;
        if (!taken.has(candidate)) {
            return candidate;
        }
    }
    return `agent-${agents.length + 1}`;
}
