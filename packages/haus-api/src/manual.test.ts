import { expect, test } from 'bun:test';
import {
    agentManualGetResponseSchema,
    agentManualSearchResponseSchema,
    agentManualSearchResultSchema,
    agentManualTopicSchema,
} from './manual.ts';

const recipeTopic = {
    body: '# Claim before work\n',
    class: 'technique' as const,
    evidence: 'verified' as const,
    id: 'recipes/technique/claim-lock',
    industries: ['universal'],
    kind: 'recipe' as const,
    prereqs: ['message number or id'],
    related: ['recipes/index'],
    summary: 'Claim canonical work before acting.',
    tier: 'seeded' as const,
    title: 'Claim before work',
    triggers: ['should I claim this before starting'],
};

const navigationTopic = {
    body: 'The shared Manual index.',
    id: 'index',
    kind: 'index' as const,
    related: ['haus-cli-overview'],
    summary: 'Navigate the Manual.',
    title: 'Haus Manual',
};

test('Manual topic schemas require recipe metadata and reject it on navigation topics', () => {
    expect(agentManualTopicSchema.safeParse(recipeTopic).success).toBe(true);
    expect(agentManualTopicSchema.safeParse(navigationTopic).success).toBe(true);
    expect(agentManualTopicSchema.safeParse({ ...recipeTopic, triggers: undefined }).success).toBe(
        false
    );
    expect(
        agentManualTopicSchema.safeParse({ ...navigationTopic, class: 'technique' }).success
    ).toBe(false);
});

test('Manual get and search schemas preserve the same discriminated contract', () => {
    const { body: _recipeBody, related: _recipeRelated, ...recipeResult } = recipeTopic;
    const {
        body: _navigationBody,
        related: _navigationRelated,
        ...navigationResult
    } = navigationTopic;

    expect(agentManualGetResponseSchema.safeParse({ topic: recipeTopic }).success).toBe(true);
    expect(agentManualGetResponseSchema.safeParse({ topic: navigationTopic }).success).toBe(true);
    expect(agentManualSearchResultSchema.safeParse(recipeResult).success).toBe(true);
    expect(agentManualSearchResultSchema.safeParse(navigationResult).success).toBe(true);
    expect(
        agentManualSearchResultSchema.safeParse({ ...recipeResult, class: undefined }).success
    ).toBe(false);
    expect(
        agentManualSearchResultSchema.safeParse({ ...navigationResult, tier: 'seeded' }).success
    ).toBe(false);
    expect(
        agentManualSearchResponseSchema.safeParse({
            query: 'claim',
            results: [recipeResult, navigationResult],
            scope: 'all',
        }).success
    ).toBe(true);
});
