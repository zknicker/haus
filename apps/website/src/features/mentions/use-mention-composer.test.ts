import { describe, expect, it } from 'bun:test';
import type { ActiveMentionQuery, Mention, MentionOption } from './mention-types.ts';
import { selectVisibleOptions } from './mention-visible-options.ts';
import {
    resolveSkillScopeAgentIds,
    resolveSkillScopeAgentIdsKey,
} from './use-mention-composer.tsx';

describe('selectVisibleOptions', () => {
    it('uses @ for Agent and human references', () => {
        expect(
            selectVisibleOptions({
                activeQuery: createQuery('@'),
                mentionOptions: [agentOption, humanOption, skillOption, appOption, chatOption],
            })
        ).toEqual([agentOption, humanOption]);
    });

    it('uses $ only for skill mentions', () => {
        expect(
            selectVisibleOptions({
                activeQuery: createQuery('$'),
                mentionOptions: [agentOption, skillOption, appOption],
            })
        ).toEqual([skillOption]);
    });

    it('uses # only for channel mentions', () => {
        expect(
            selectVisibleOptions({
                activeQuery: createQuery('#'),
                mentionOptions: [agentOption, humanOption, skillOption, appOption, chatOption],
            })
        ).toEqual([chatOption]);
    });
});

describe('resolveSkillScopeAgentIds', () => {
    it('falls back to all mentionable chat agents when no agent is tagged', () => {
        expect(
            resolveSkillScopeAgentIds({
                agentId: '',
                mentionableAgentIds: ['agent:planner', 'agent:builder'],
                mentions: [],
            })
        ).toEqual(['agent:planner', 'agent:builder']);
    });

    it('uses the tagged agent union when agent mentions exist', () => {
        expect(
            resolveSkillScopeAgentIds({
                agentId: '',
                mentionableAgentIds: ['agent:planner', 'agent:builder', 'agent:critic'],
                mentions: [
                    {
                        end: 8,
                        id: 'agent://agent%3Aplanner',
                        kind: 'agent',
                        label: 'Planner',
                        projection: 'agent-reference',
                        start: 0,
                        text: '@Planner',
                    },
                    {
                        end: 17,
                        id: 'agent://agent%3Abuilder',
                        kind: 'agent',
                        label: 'Builder',
                        projection: 'agent-reference',
                        start: 9,
                        text: '@Builder',
                    },
                ],
            })
        ).toEqual(['agent:planner', 'agent:builder']);
    });

    it('ignores stale agent mentions outside the current mentionable chat agents', () => {
        expect(
            resolveSkillScopeAgentIds({
                agentId: '',
                mentionableAgentIds: ['agent:planner'],
                mentions: [
                    {
                        end: 6,
                        id: 'agent://agent%3Astale',
                        kind: 'agent',
                        label: 'Stale',
                        projection: 'agent-reference',
                        start: 0,
                        text: '@Stale',
                    },
                ],
            })
        ).toEqual(['agent:planner']);
    });

    it('falls back to the composer agent when no chat agent set exists', () => {
        expect(
            resolveSkillScopeAgentIds({
                agentId: 'agent:primary',
                mentionableAgentIds: [],
                mentions: [],
            })
        ).toEqual(['agent:primary']);
    });
});

describe('resolveSkillScopeAgentIdsKey', () => {
    // The editor rebuilds its mentions array on every keystroke. The scope key
    // must stay equal across those renders, or the memoized query input and the
    // prefetch callback change identity and fire one prefetch per keystroke.
    it('is unchanged when only the mentions array identity changes', () => {
        const first = resolveSkillScopeAgentIdsKey({
            agentId: 'agent:primary',
            mentionableAgentIds: ['agent:planner'],
            mentions: [plannerMention()],
        });
        const second = resolveSkillScopeAgentIdsKey({
            agentId: 'agent:primary',
            mentionableAgentIds: ['agent:planner'],
            mentions: [plannerMention()],
        });

        expect(second).toBe(first);
    });

    it('changes when the resolved scope changes', () => {
        const scoped = resolveSkillScopeAgentIdsKey({
            agentId: 'agent:primary',
            mentionableAgentIds: ['agent:planner', 'agent:builder'],
            mentions: [plannerMention()],
        });
        const unscoped = resolveSkillScopeAgentIdsKey({
            agentId: 'agent:primary',
            mentionableAgentIds: ['agent:planner', 'agent:builder'],
            mentions: [],
        });

        expect(scoped).not.toBe(unscoped);
    });

    it('round-trips back to the resolved agent ids', () => {
        const params = {
            agentId: 'agent:primary',
            mentionableAgentIds: ['agent:planner', 'agent:builder'],
            mentions: [],
        };

        expect(resolveSkillScopeAgentIdsKey(params).split('\n')).toEqual(
            resolveSkillScopeAgentIds(params)
        );
    });
});

function plannerMention(): Mention {
    return {
        end: 8,
        id: 'agent://agent%3Aplanner',
        kind: 'agent',
        label: 'Planner',
        projection: 'agent-reference',
        start: 0,
        text: '@Planner',
    };
}

function createQuery(trigger: '@' | '$' | '#'): ActiveMentionQuery {
    return {
        end: 1,
        query: '',
        start: 0,
        trigger,
    };
}

const agentOption: MentionOption = {
    description: 'Agent in this chat',
    id: 'agt_primary',
    insertText: '@Haus',
    kind: 'agent',
    label: 'Haus',
    projection: 'agent-reference',
};

const skillOption: MentionOption = {
    description: 'Use Haus chat context, memory, files, and local tools.',
    id: 'skill://haus',
    insertText: 'haus',
    kind: 'skill',
    label: 'Haus Agent',
    projection: 'skill-activation',
};

const humanOption: MentionOption = {
    description: 'Human · @ada',
    id: 'user://usr_ada',
    insertText: '@Ada Lovelace',
    kind: 'user',
    label: 'Ada Lovelace',
    projection: 'user-reference',
};

const appOption: MentionOption = {
    description: 'Computer Use',
    id: 'plugin://computer-use@openai-bundled',
    insertText: 'Finder',
    kind: 'app',
    label: 'Finder',
    projection: 'capability-reference',
};

const chatOption: MentionOption = {
    description: 'Channel',
    id: 'chat://cht_product',
    insertText: '#product',
    kind: 'chat',
    label: 'product',
    metadata: { chatColor: null, chatIcon: null },
    projection: 'chat-reference',
    sourceLabel: 'Channels',
};
