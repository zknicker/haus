import { expect } from 'bun:test';

export async function readCreationGuidance(url: URL, token: string) {
    for (const topic of ['agent', 'recipes/decision/one-or-many', 'recipes/archetype/patrol']) {
        const query = new URLSearchParams({
            intent: 'Create a teammate for a durable delivery-watch lane.',
            reason: 'Read full guidance before adapting its standing brief.',
            topic,
        });
        const lookup = await fetch(new URL(`/api/agent/manual/get?${query}`, url), {
            headers: { authorization: `Bearer ${token}` },
        });
        expect(lookup.status).toBe(200);
    }
}
