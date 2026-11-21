export function agentQueues() {
    const pending = new Map<string, number>();
    const queues = new Map<string, Promise<unknown>>();
    return {
        busy: (agentId: string) => pending.has(agentId),
        enqueue(agentId: string, work: () => Promise<void>) {
            const previous = queues.get(agentId) ?? Promise.resolve();
            pending.set(agentId, (pending.get(agentId) ?? 0) + 1);
            const next = previous.then(work).finally(() => {
                const left = (pending.get(agentId) ?? 1) - 1;
                if (left > 0) {
                    pending.set(agentId, left);
                } else {
                    pending.delete(agentId);
                }
            });
            queues.set(
                agentId,
                next.catch(() => undefined)
            );
            return next;
        },
    };
}
