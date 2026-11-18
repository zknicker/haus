import { describe, expect, it } from 'bun:test';
import type { AgentMentionAppearance } from './mention-metadata.ts';
import {
    applyAgentMentionAppearance,
    applyChatMentionAppearance,
    applyHumanMentionAppearance,
    readMentionsFromMarkdown,
} from './mention-metadata.ts';

describe('readMentionsFromMarkdown', () => {
    it('reads explicit rich reference links from message content', () => {
        const content =
            'Ask [@Haus](agent://agt_primary), open [@Computer Use](plugin://computer-use@openai-bundled), [@Chrome](app://computer-use/google-chrome), read [$ui](skill://ui), [mentions.md](/Users/zknicker/.codex/worktrees/1b41/haus/specs/mentions.md), and [components/ui](/Users/zknicker/.codex/worktrees/1b41/haus/apps/website/src/components/ui)';

        expect(readMentionsFromMarkdown(content)).toEqual([
            {
                end: 32,
                id: 'agent://agt_primary',
                kind: 'agent',
                label: 'Haus',
                projection: 'agent-reference',
                start: 4,
                text: '[@Haus](agent://agt_primary)',
            },
            {
                end: 92,
                id: 'plugin://computer-use@openai-bundled',
                kind: 'plugin',
                label: 'Computer Use',
                projection: 'capability-reference',
                start: 39,
                text: '[@Computer Use](plugin://computer-use@openai-bundled)',
            },
            {
                end: 137,
                id: 'app://computer-use/google-chrome',
                kind: 'app',
                label: 'Chrome',
                projection: 'capability-reference',
                start: 94,
                text: '[@Chrome](app://computer-use/google-chrome)',
            },
            {
                end: 161,
                id: 'skill://ui',
                kind: 'skill',
                label: 'ui',
                projection: 'skill-activation',
                start: 144,
                text: '[$ui](skill://ui)',
            },
            {
                end: 238,
                id: '/Users/zknicker/.codex/worktrees/1b41/haus/specs/mentions.md',
                kind: 'file',
                label: 'mentions.md',
                projection: 'path-reference',
                start: 163,
                text: '[mentions.md](/Users/zknicker/.codex/worktrees/1b41/haus/specs/mentions.md)',
            },
            {
                end: content.length,
                id: '/Users/zknicker/.codex/worktrees/1b41/haus/apps/website/src/components/ui',
                kind: 'directory',
                label: 'components/ui',
                projection: 'path-reference',
                start: 244,
                text: '[components/ui](/Users/zknicker/.codex/worktrees/1b41/haus/apps/website/src/components/ui)',
            },
        ]);
    });

    it('ignores bare mention-looking text', () => {
        expect(readMentionsFromMarkdown('@Haus and $ui are plain text')).toEqual([]);
    });
});

describe('human rich references', () => {
    it('parses immutable user targets and applies the live profile', () => {
        const mentions = readMentionsFromMarkdown('Ask [@Ada](user://usr_ada)');
        const resolved = applyHumanMentionAppearance(mentions, (userId) =>
            userId === 'usr_ada'
                ? { avatarUrl: '/api/avatars/ada', displayName: 'Ada Byron' }
                : { avatarUrl: null, displayName: null }
        );

        expect(resolved[0]).toMatchObject({
            id: 'user://usr_ada',
            kind: 'user',
            label: 'Ada',
            metadata: {
                userAvatarUrl: '/api/avatars/ada',
                userDisplayName: 'Ada Byron',
            },
            projection: 'user-reference',
        });
    });

    it('keeps the persisted label as a stable fallback for an unknown human', () => {
        const mentions = readMentionsFromMarkdown('Ask [@Former Ada](user://usr_departed)');
        expect(
            applyHumanMentionAppearance(mentions, () => ({
                avatarUrl: null,
                displayName: null,
            }))
        ).toEqual(mentions);
    });
});

describe('applyAgentMentionAppearance', () => {
    const appearances: Record<string, AgentMentionAppearance> = {
        agt_blippy: {
            avatarUrl: '/api/avatars/avt_0123456789abcdef',
            displayName: 'Blippy',
            primaryColor: '#2563eb',
        },
        agt_plain: { avatarUrl: null, displayName: 'Plain Agent', primaryColor: '#f97316' },
    };
    const lookup = (agentId: string | null | undefined): AgentMentionAppearance =>
        (agentId ? appearances[agentId] : undefined) ?? {
            avatarUrl: null,
            displayName: null,
            primaryColor: null,
        };

    it('adds live agent display name, avatar, and color metadata to agent mentions', () => {
        const mentions = readMentionsFromMarkdown('Ask [@Blippy](agent://agt_blippy)');

        expect(applyAgentMentionAppearance(mentions, lookup)).toEqual([
            {
                ...mentions[0],
                metadata: {
                    agentAvatarUrl: '/api/avatars/avt_0123456789abcdef',
                    agentColor: '#2563eb',
                    agentDisplayName: 'Blippy',
                },
            },
        ]);
    });

    it('keeps configured color for agents without an uploaded avatar', () => {
        const mentions = readMentionsFromMarkdown('Ask [@Plain](agent://agt_plain)');

        expect(applyAgentMentionAppearance(mentions, lookup)[0]?.metadata).toEqual({
            agentAvatarUrl: null,
            agentColor: '#f97316',
            agentDisplayName: 'Plain Agent',
        });
    });

    it('leaves unknown agents and non-agent mentions untouched', () => {
        const mentions = readMentionsFromMarkdown(
            'Ask [@Ghost](agent://agt_ghost) about [$ui](skill://ui)'
        );

        expect(applyAgentMentionAppearance(mentions, lookup)).toEqual(mentions);
    });
});

describe('applyChatMentionAppearance', () => {
    it('adds the live Channel icon and color to a persisted chat reference', () => {
        const mentions = readMentionsFromMarkdown('[#product](chat://cht_product)');

        expect(
            applyChatMentionAppearance(mentions, (chatId) =>
                chatId === 'cht_product'
                    ? { color: 'violet', icon: 'RocketIcon' }
                    : { color: null, icon: null }
            )[0]?.metadata
        ).toEqual({ chatColor: 'violet', chatIcon: 'RocketIcon' });
    });
});
