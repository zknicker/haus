interface AgentUse {
    active: number;
    cleaning: Promise<void> | null;
    drained: Array<() => void>;
}

const uses = new Map<string, AgentUse>();

export async function withAgentUse<T>(agentId: string, work: () => Promise<T>) {
    let use = agentUseOf(agentId);
    while (use.cleaning) {
        await use.cleaning;
        use = agentUseOf(agentId);
    }
    use.active += 1;
    try {
        return await work();
    } finally {
        use.active -= 1;
        if (use.active === 0) {
            for (const resolve of use.drained.splice(0)) {
                resolve();
            }
        }
        forgetIdle(agentId, use);
    }
}

export async function withAgentCleanup<T>(agentId: string, work: () => Promise<T>) {
    let use = agentUseOf(agentId);
    while (use.cleaning) {
        await use.cleaning;
        use = agentUseOf(agentId);
    }
    const cleaning = Promise.withResolvers<void>();
    use.cleaning = cleaning.promise;
    try {
        if (use.active > 0) {
            const drained = Promise.withResolvers<void>();
            use.drained.push(drained.resolve);
            await drained.promise;
        }
        return await work();
    } finally {
        use.cleaning = null;
        cleaning.resolve();
        forgetIdle(agentId, use);
    }
}

function agentUseOf(agentId: string) {
    const use = uses.get(agentId) ?? { active: 0, cleaning: null, drained: [] };
    uses.set(agentId, use);
    return use;
}

function forgetIdle(agentId: string, use: AgentUse) {
    if (use.active === 0 && use.cleaning === null && uses.get(agentId) === use) {
        uses.delete(agentId);
    }
}
