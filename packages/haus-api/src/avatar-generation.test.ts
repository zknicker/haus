import { expect, test } from 'bun:test';
import {
    agentAvatarGenerationInputSchema,
    avatarGenerationConceptMaxLength,
    avatarGenerationPromptTemplate,
    avatarGenerationRequestSchema,
    buildAvatarGenerationPrompt,
} from './avatar-generation.ts';

test('scopes human avatar generation to one active Agent and Server', () => {
    expect(
        agentAvatarGenerationInputSchema.parse({
            agentId: 'agt_scout',
            concept: '  fox mechanic  ',
            serverId: 'srv_hq',
        })
    ).toEqual({ agentId: 'agt_scout', concept: 'fox mechanic', serverId: 'srv_hq' });
    expect(
        agentAvatarGenerationInputSchema.safeParse({
            agentId: 'agt_scout',
            concept: 'fox',
            serverId: 'srv_hq',
            target: 'name-derived',
        }).success
    ).toBe(false);
});

test('builds the canonical avatar prompt with only the trimmed concept substituted', () => {
    const concept = 'a moonlit raccoon cartographer';

    expect(buildAvatarGenerationPrompt(concept)).toBe(
        'Create a polished retro pixel-art character avatar based on the concept below. Make it a close-up square portrait with bold, highly readable shapes, expressive oversized eyes, crisp stepped pixel edges, and rich but controlled pixel shading. Interpret the concept creatively: invent distinctive clothing, accessories, expressions, silhouettes, or fantasy/adventure details that give the character personality and make it feel like a memorable game character rather than a generic illustration. Keep the composition simple enough to read clearly at small avatar sizes, with the character filling most of the frame. Use a bright, flat single-color background that strongly contrasts with the character. No circular border, badge, text, scenery, or UI elements. Aim for charming, slightly fantastical, high-quality 16-bit/RPG character art with a modern polished finish.\n\n**Concept:** a moonlit raccoon cartographer'
    );
    expect(avatarGenerationPromptTemplate).toContain('**Concept:** {concept}');
});

test('validates a required trimmed short concept', () => {
    expect(avatarGenerationRequestSchema.parse({ concept: '  fox mechanic  ' })).toEqual({
        concept: 'fox mechanic',
    });
    expect(avatarGenerationRequestSchema.safeParse({ concept: '   ' }).success).toBe(false);
    expect(
        avatarGenerationRequestSchema.safeParse({
            concept: 'x'.repeat(avatarGenerationConceptMaxLength + 1),
        }).success
    ).toBe(false);
    expect(avatarGenerationRequestSchema.safeParse({ concept: 'fox', extra: true }).success).toBe(
        false
    );
});
