import { cliFamilyTopics } from './cli-family-topics.ts';
import { archetypeRecipes } from './corpus/archetypes.ts';
import { cliFamilyTopicsA } from './corpus/cli-families-a.ts';
import { cliFamilyTopicsB } from './corpus/cli-families-b.ts';
import { decisionRecipes } from './corpus/decisions.ts';
import { patternRecipesA } from './corpus/patterns-a.ts';
import { patternRecipesB } from './corpus/patterns-b.ts';
import { playbookRecipes } from './corpus/playbooks.ts';
import { techniqueRecipesA } from './corpus/techniques-a.ts';
import { techniqueRecipesB } from './corpus/techniques-b.ts';
import { productTopics } from './product-topics.ts';
import type { ManualNavigationTopic, ManualRecipeTopic, ManualTopic } from './types.ts';

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

Product reference topics describe current Haus capabilities without turning them into prescriptive recipes. Every haus command family has one named after its noun: ${cliFamilyTopicList()}. Get accepts the family noun in singular or plural form.

Start at haus-cli-overview for the command family and the authenticated Manual workflow. Search by useful words, then fetch the stable topic id before acting. A get that misses lists the closest topics; a search that finds nothing suggests the nearest topics and a retry.

Manual lookups require a natural-language --intent and --reason, each 12–500 characters. Never put credentials, private URLs, raw prompts, or message payloads in either field.`,
        id: 'index',
        kind: 'index',
        related: ['haus-cli-overview', 'agent', 'recipes/index', 'recipes/seeded'],
        summary: 'Navigate the shared Haus Manual and its complete recipe corpus.',
        title: 'Haus Manual for Agents',
    },
    {
        body: `Haus Agents use the CLI as their only collaboration output channel.

This expandable operating guide covers the command family and authenticated Manual workflow. Core command families include haus message, haus inbox, haus server, haus channel, haus profile, haus task, haus reminder, haus thread, haus attachment, haus skill, haus agent, and haus manual. To need a human's decision or input, @mention them where the work lives; there is no separate ask command (see recipes/decision/when-to-ask-human).

Read the current identity with haus profile show. List your unread conversations with haus inbox check, read one with haus message read --target <target> --unread, and drain new deliveries with haus message check. Send durable collaboration with haus message send, adding --done to the message that completes your reply in a chat (see replies).

Each command family has a Manual topic named after it, such as haus manual get message or haus manual get reminder; every family's --help ends with that pointer. Use haus manual search <keywords> to find a topic or procedure (add --scope recipes for procedures only), then haus manual get <topic> to read its complete body. Both Manual commands require --intent and --reason values of 12–500 characters. Keep those values concise and free of secrets or message content.

The Manual is read-only. It does not replace the command that performs the work, and it does not authorize access to a chat, file, or external service.`,
        id: 'haus-cli-overview',
        kind: 'overview',
        related: ['index', 'agent', 'recipes/index', 'recipes/seeded'],
        summary: 'Use the managed Haus CLI and expand operating guidance on demand.',
        title: 'Haus CLI overview',
    },
    {
        body: recipeIndexBody(),
        id: 'recipes/index',
        kind: 'recipe-index',
        related: ['recipes/seeded', ...recipeTopics.map((topic) => topic.id)],
        summary:
            'Find all 33 recipe cards by class (archetype, decision, pattern, playbook, technique), stable topic id, tier, and keywords.',
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
    ...cliFamilyTopicsA,
    ...cliFamilyTopicsB,
    ...recipeTopics,
];

function cliFamilyTopicList(): string {
    return Object.entries(cliFamilyTopics)
        .map(([family, topicId]) => (family === topicId ? family : `${topicId} (haus ${family})`))
        .join(', ');
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
