export type ManualTopicKind = 'index' | 'overview' | 'recipe-index' | 'recipe';

export type ManualRecipeClass = 'archetype' | 'decision' | 'pattern' | 'playbook' | 'technique';
export type ManualDeliveryTier = 'seeded' | 'query';

interface ManualTopicBase {
    /**
     * Exact lookup shapes Agents were observed to try for this topic. Server-side
     * lookup only; never part of the wire topic. Add an alias only for a real miss.
     */
    aliases?: readonly string[];
    body: string;
    id: string;
    kind: ManualTopicKind;
    related: string[];
    summary: string;
    title: string;
}

export interface ManualNavigationTopic extends ManualTopicBase {
    kind: 'index' | 'overview' | 'recipe-index';
}

export interface ManualRecipeTopic extends ManualTopicBase {
    class: ManualRecipeClass;
    evidence: 'verified';
    industries: string[];
    kind: 'recipe';
    prereqs: string[];
    tier: ManualDeliveryTier;
    triggers: string[];
}

export type ManualTopic = ManualNavigationTopic | ManualRecipeTopic;
