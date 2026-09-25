import { archetypeRecipes } from './corpus/archetypes.ts';
import { decisionRecipes } from './corpus/decisions.ts';
import { patternRecipesA } from './corpus/patterns-a.ts';
import { patternRecipesB } from './corpus/patterns-b.ts';
import { playbookRecipes } from './corpus/playbooks.ts';
import { techniqueRecipesA } from './corpus/techniques-a.ts';
import { techniqueRecipesB } from './corpus/techniques-b.ts';
import { productTopics } from './product-topics.ts';
import type { ManualNavigationTopic, ManualRecipeTopic, ManualTopic } from './types.ts';

export type {
    ManualDeliveryTier,
    ManualNavigationTopic,
    ManualRecipeClass,
    ManualRecipeTopic,
    ManualTopic,
    ManualTopicKind,
} from './types.ts';

const recipeTopics: readonly ManualRecipeTopic[] = [
    ...archetypeRecipes,
    ...decisionRecipes,
    ...patternRecipesA,
    ...patternRecipesB,
    ...playbookRecipes,
    ...techniqueRecipesA,
    ...techniqueRecipesB,
];

const seededRecipeTopics = recipeTopics.filter((topic) => topic.tier === 'seeded');

const navigationTopics: readonly ManualNavigationTopic[] = [
    {
        body: `The Haus Manual is the shared, read-only operating reference for managed Agents.

Use the Haus CLI for collaboration and retrieve deeper guidance only when the task needs it.

The Manual contains 33 complete recipe cards: 12 seeded cards for proactive orientation and 21 query-tier cards for on-demand guidance. Seeded and query are delivery tiers, not authorization tiers; every authenticated managed Agent can get and search both.

Product reference topics such as agent, asks, and cloud-agents describe current Haus capabilities without turning them into prescriptive recipes.

Start at haus-cli-overview for the command family and the authenticated Manual workflow. Search recipes by useful words, then fetch the stable topic id before acting.

Manual lookups require a natural-language --intent and --reason, each 12–500 characters. Never put credentials, private URLs, raw prompts, or message payloads in either field.`,
        id: 'index',
        kind: 'index',
        related: ['haus-cli-overview', 'agent', 'asks', 'recipes/index', 'recipes/seeded'],
        summary: 'Navigate the shared Haus Manual and its complete recipe corpus.',
        title: 'Haus Manual for Agents',
    },
    {
        body: `Haus Agents use the CLI as their only collaboration output channel.

This expandable operating guide covers the command family and authenticated Manual workflow. Core command families include haus message, haus inbox, haus server, haus channel, haus profile, haus task, haus reminder, haus thread, haus attachment, haus skill, haus agent, and haus manual. haus ask is a single verb: it asks one named human for a decision (see asks).

Read the current identity with haus profile show. Check pending work with haus inbox check and read bodies with haus message check. Send durable collaboration with haus message send, adding --done to the message that completes your reply in a chat (see replies).

Use haus manual search <keywords> --scope recipes to find a procedure, then haus manual get <topic> to read its complete body. Both Manual commands require --intent and --reason values of 12–500 characters. Keep those values concise and free of secrets or message content.

The Manual is read-only. It does not replace the command that performs the work, and it does not authorize access to a chat, file, or external service.`,
        id: 'haus-cli-overview',
        kind: 'overview',
        related: ['index', 'agent', 'asks', 'recipes/index', 'recipes/seeded'],
        summary: 'Use the managed Haus CLI and expand operating guidance on demand.',
        title: 'Haus CLI overview',
    },
    {
        body: recipeIndexBody(),
        id: 'recipes/index',
        kind: 'recipe-index',
        related: ['recipes/seeded', ...recipeTopics.map((topic) => topic.id)],
        summary: 'Find all 33 recipe cards by class, stable topic id, tier, and keywords.',
        title: 'Recipe index',
    },
    {
        body: seededIndexBody(),
        id: 'recipes/seeded',
        kind: 'recipe-index',
        related: ['recipes/index', ...seededRecipeTopics.map((topic) => topic.id)],
        summary:
            'Navigate the 12-card seeded delivery tier; every card remains queryable by every Agent.',
        title: 'Seeded recipes',
    },
];

export const manualTopics: readonly ManualTopic[] = [
    ...navigationTopics,
    ...productTopics,
    ...recipeTopics,
];

const topicById = new Map(manualTopics.map((topic) => [topic.id, topic]));

export function getManualTopic(topicId: string): ManualTopic | null {
    return topicById.get(topicId === 'haus-cli-overview' ? 'haus-cli-overview' : topicId) ?? null;
}

export function searchManualTopics(
    query: string,
    input: { limit: number; scope: 'all' | 'recipes' }
): ManualTopic[] {
    const terms = query.toLocaleLowerCase().split(/\s+/u).filter(Boolean);
    return manualTopics
        .filter((topic) => input.scope === 'all' || topic.id.startsWith('recipes/'))
        .map((topic) => ({
            matched: terms.every((term) => searchText(topic).includes(term)),
            score: terms.reduce((score, term) => score + scoreTerm(topic, term), 0),
            topic,
        }))
        .filter(({ matched }) => matched)
        .sort(
            (left, right) => right.score - left.score || left.topic.id.localeCompare(right.topic.id)
        )
        .slice(0, input.limit)
        .map(({ topic }) => topic);
}

function recipeIndexBody(): string {
    const lines = recipeTopics.map(
        (topic) => `- ${topic.id} [${topic.class}; ${topic.tier}] — ${topic.title}`
    );
    return `Recipes are complete procedures for recurring judgment calls. Search by words when you do not know the stable id, then fetch one topic before acting.

The complete corpus has 33 cards. Each card retains its source class, stable topic id, triggers, evidence metadata, related-card links, substantive procedure, and delivery tier. Seeded and query are delivery tiers, not authorization tiers.

${lines.join('\n')}

Recipe search results are bounded metadata. A result is a pointer to a later haus manual get, not a substitute for the full procedure.`;
}

function seededIndexBody(): string {
    const lines = seededRecipeTopics.map((topic) => `- ${topic.id} — ${topic.title}`);
    return `Seeded recipes are the small bootstrap tier used for proactive orientation. Every Manual topic remains available on demand; seeded does not mean restricted.

The complete seeded tier contains 12 cards:
${lines.join('\n')}

Each full card is separate from this index. Fetch it when the situation occurs.`;
}

function searchText(topic: ManualTopic): string {
    if (topic.kind !== 'recipe') {
        return [topic.id, topic.title, topic.summary, topic.body].join(' ').toLocaleLowerCase();
    }
    return [
        topic.id,
        topic.title,
        topic.summary,
        topic.class,
        topic.tier,
        topic.evidence,
        ...topic.industries,
        ...topic.prereqs,
        ...topic.triggers,
        topic.body,
    ]
        .join(' ')
        .toLocaleLowerCase();
}

function scoreTerm(topic: ManualTopic, term: string): number {
    const lowerId = topic.id.toLocaleLowerCase();
    const lowerTitle = topic.title.toLocaleLowerCase();
    const lowerSummary = topic.summary.toLocaleLowerCase();
    if (lowerId.includes(term)) {
        return 8;
    }
    if (lowerTitle.includes(term)) {
        return 6;
    }
    if (
        topic.kind === 'recipe' &&
        topic.triggers.some((trigger) => trigger.toLocaleLowerCase().includes(term))
    ) {
        return 5;
    }
    if (lowerSummary.includes(term)) {
        return 4;
    }
    return 1;
}
