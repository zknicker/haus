import { describe, expect, it } from 'bun:test';
import {
    compileMentionSubmission,
    getActiveMentionQuery,
    normalizeMentions,
    reconcileMentions,
    selectMention,
} from './mention-text.ts';

describe('mention text helpers', () => {
    it('serializes a selected human with a display label and immutable user target', () => {
        expect(
            compileMentionSubmission('@Ada Lovelace', [
                {
                    end: 13,
                    id: 'user://usr_ada',
                    kind: 'user',
                    label: 'Ada Lovelace',
                    projection: 'user-reference',
                    start: 0,
                    text: '@Ada Lovelace',
                },
            ]).content
        ).toBe('[@Ada Lovelace](user://usr_ada)');
    });

    it('finds the active @ query before the caret', () => {
        expect(getActiveMentionQuery('use @Hat', 8)).toEqual({
            end: 8,
            query: 'Hat',
            start: 4,
            trigger: '@',
        });
    });

    it('finds the active $ query as a skills-only trigger', () => {
        expect(getActiveMentionQuery('use $wik', 8)).toEqual({
            end: 8,
            query: 'wik',
            start: 4,
            trigger: '$',
        });
    });

    it('finds the active # query as a channels-only trigger', () => {
        expect(getActiveMentionQuery('go to #prod', 11)).toEqual({
            end: 11,
            query: 'prod',
            start: 6,
            trigger: '#',
        });
    });

    it('never treats a markdown heading as a # query', () => {
        expect(getActiveMentionQuery('# ', 2)).toBeNull();
    });

    it('never treats leading or mid-message slashes as a trigger', () => {
        expect(getActiveMentionQuery('/mod', 4)).toBeNull();
        expect(getActiveMentionQuery('see /mod', 8)).toBeNull();
        expect(getActiveMentionQuery('/usr/local', 10)).toBeNull();
    });

    it('keeps mention offsets aligned when text changes before the mention', () => {
        const mentions = [
            {
                end: 13,
                id: 'hatch-pet',
                kind: 'skill' as const,
                label: 'Hatch Pet',
                projection: 'skill-activation' as const,
                start: 4,
                text: 'Hatch Pet',
            },
        ];

        expect(reconcileMentions('use Hatch Pet', 'please use Hatch Pet', mentions)).toEqual([
            {
                ...mentions[0],
                end: 20,
                start: 11,
            },
        ]);
    });

    it('drops mentions when their text no longer matches', () => {
        expect(
            normalizeMentions('use Hatch', [
                {
                    end: 13,
                    id: 'hatch-pet',
                    kind: 'skill',
                    label: 'Hatch Pet',
                    projection: 'skill-activation',
                    start: 4,
                    text: 'Hatch Pet',
                },
            ])
        ).toEqual([]);
    });

    it('keeps later mention offsets aligned when selecting a new earlier mention', () => {
        expect(
            selectMention({
                activeQuery: {
                    end: 8,
                    query: 'Git',
                    start: 4,
                    trigger: '@',
                },
                content: 'use @Ins then Hatch Pet',
                mentions: [
                    {
                        end: 23,
                        id: 'hatch-pet',
                        kind: 'skill',
                        label: 'Hatch Pet',
                        projection: 'skill-activation',
                        start: 14,
                        text: 'Hatch Pet',
                    },
                ],
                option: {
                    id: 'skill://skill-installer',
                    insertText: 'Skill Installer',
                    kind: 'skill',
                    label: 'Skill Installer',
                    projection: 'skill-activation',
                },
            }).nextMentions
        ).toEqual([
            {
                end: 19,
                id: 'skill://skill-installer',
                kind: 'skill',
                label: 'Skill Installer',
                projection: 'skill-activation',
                start: 4,
                text: 'Skill Installer',
            },
            {
                end: 34,
                id: 'hatch-pet',
                kind: 'skill',
                label: 'Hatch Pet',
                projection: 'skill-activation',
                start: 25,
                text: 'Hatch Pet',
            },
        ]);
    });

    it('adds a trailing space after selecting a mention at the end of the prompt', () => {
        expect(
            selectMention({
                activeQuery: {
                    end: 11,
                    query: 'Hat',
                    start: 7,
                    trigger: '@',
                },
                content: 'launch @Hat',
                mentions: [],
                option: {
                    id: 'skill://hatch-pet',
                    insertText: 'Hatch Pet',
                    kind: 'skill',
                    label: 'Hatch Pet',
                    projection: 'skill-activation',
                },
            })
        ).toMatchObject({
            nextCaretIndex: 17,
            nextContent: 'launch Hatch Pet ',
            nextMentions: [
                {
                    end: 16,
                    id: 'skill://hatch-pet',
                    kind: 'skill',
                    label: 'Hatch Pet',
                    projection: 'skill-activation',
                    start: 7,
                    text: 'Hatch Pet',
                },
            ],
        });
    });

    it('compiles visible mention chips into markdown links for submission', () => {
        expect(
            compileMentionSubmission('launch Hatch Pet', [
                {
                    end: 16,
                    id: 'skill://hatch-pet',
                    kind: 'skill',
                    label: 'Hatch Pet',
                    projection: 'skill-activation',
                    start: 7,
                    text: 'Hatch Pet',
                },
            ])
        ).toEqual({
            content: 'launch [$Hatch Pet](skill://hatch-pet)',
            mentions: [
                {
                    end: 38,
                    id: 'skill://hatch-pet',
                    kind: 'skill',
                    label: 'Hatch Pet',
                    projection: 'skill-activation',
                    start: 7,
                    text: '[$Hatch Pet](skill://hatch-pet)',
                },
            ],
        });
    });

    it('compiles skill markdown with the raw skill text instead of the display label', () => {
        expect(
            compileMentionSubmission('use agent-browser', [
                {
                    end: 17,
                    id: 'skill://agent-browser',
                    kind: 'skill',
                    label: 'Agent Browser',
                    projection: 'skill-activation',
                    start: 4,
                    text: 'agent-browser',
                },
            ])
        ).toEqual({
            content: 'use [$agent-browser](skill://agent-browser)',
            mentions: [
                {
                    end: 43,
                    id: 'skill://agent-browser',
                    kind: 'skill',
                    label: 'Agent Browser',
                    projection: 'skill-activation',
                    start: 4,
                    text: '[$agent-browser](skill://agent-browser)',
                },
            ],
        });
    });

    it('compiles agent mentions as explicit rich links', () => {
        const compiled = compileMentionSubmission('@Planner please review this', [
            {
                end: 8,
                id: 'agent://agent%3Aplanner',
                kind: 'agent',
                label: 'Planner',
                projection: 'agent-reference',
                start: 0,
                text: '@Planner',
            },
        ]);

        expect(compiled).toEqual({
            content: '[@Planner](agent://agent%3Aplanner) please review this',
            mentions: [
                {
                    end: 35,
                    id: 'agent://agent%3Aplanner',
                    kind: 'agent',
                    label: 'Planner',
                    projection: 'agent-reference',
                    start: 0,
                    text: '[@Planner](agent://agent%3Aplanner)',
                },
            ],
        });
    });

    it('compiles a selected channel with a # prefix and immutable chat target', () => {
        expect(
            compileMentionSubmission('go to #product', [
                {
                    end: 14,
                    id: 'chat://cht_product',
                    kind: 'chat',
                    label: 'product',
                    projection: 'chat-reference',
                    start: 6,
                    text: '#product',
                },
            ]).content
        ).toBe('go to [#product](chat://cht_product)');
    });

    it('compiles app, plugin, file, and directory mentions with spec markdown', () => {
        const cases = [
            {
                content: 'Use Computer Use',
                expectedContent: 'Use [@Computer Use](plugin://computer-use@openai-bundled)',
                expectedText: '[@Computer Use](plugin://computer-use@openai-bundled)',
                id: 'plugin://computer-use@openai-bundled',
                kind: 'plugin' as const,
                label: 'Computer Use',
                projection: 'capability-reference' as const,
                text: 'Computer Use',
            },
            {
                content: 'Open Chrome',
                expectedContent: 'Open [@Chrome](app://computer-use/com.google.Chrome)',
                expectedText: '[@Chrome](app://computer-use/com.google.Chrome)',
                id: 'app://computer-use/com.google.Chrome',
                kind: 'app' as const,
                label: 'Chrome',
                metadata: { bundleId: 'com.google.Chrome' },
                projection: 'capability-reference' as const,
                text: 'Chrome',
            },
            {
                content: 'Read specs/mentions.md',
                expectedContent: 'Read [specs/mentions.md](/repo/specs/mentions.md)',
                expectedText: '[specs/mentions.md](/repo/specs/mentions.md)',
                id: '/repo/specs/mentions.md',
                kind: 'file' as const,
                label: 'specs/mentions.md',
                projection: 'path-reference' as const,
                text: 'specs/mentions.md',
            },
            {
                content: 'Inspect apps/website/src/components/ui',
                expectedContent:
                    'Inspect [apps/website/src/components/ui](/repo/apps/website/src/components/ui)',
                expectedText:
                    '[apps/website/src/components/ui](/repo/apps/website/src/components/ui)',
                id: '/repo/apps/website/src/components/ui',
                kind: 'directory' as const,
                label: 'apps/website/src/components/ui',
                projection: 'path-reference' as const,
                text: 'apps/website/src/components/ui',
            },
        ];

        for (const testCase of cases) {
            const start = testCase.content.indexOf(testCase.text);
            const result = compileMentionSubmission(testCase.content, [
                {
                    end: start + testCase.text.length,
                    id: testCase.id,
                    kind: testCase.kind,
                    label: testCase.label,
                    metadata: testCase.metadata,
                    projection: testCase.projection,
                    start,
                    text: testCase.text,
                },
            ]);

            expect(result).toEqual({
                content: testCase.expectedContent,
                mentions: [
                    {
                        end: start + testCase.expectedText.length,
                        id: testCase.id,
                        kind: testCase.kind,
                        label: testCase.label,
                        metadata: testCase.metadata,
                        projection: testCase.projection,
                        start,
                        text: testCase.expectedText,
                    },
                ],
            });
        }
    });

    it('compiles every current mention kind into durable content', () => {
        const content = 'Use agent-browser Computer Use Chrome specs/mentions.md components/ui';
        const inputs = [
            {
                id: 'skill://agent-browser',
                kind: 'skill' as const,
                label: 'Agent Browser',
                projection: 'skill-activation' as const,
                text: 'agent-browser',
            },
            {
                id: 'plugin://computer-use@openai-bundled',
                kind: 'plugin' as const,
                label: 'Computer Use',
                projection: 'capability-reference' as const,
                text: 'Computer Use',
            },
            {
                id: 'app://computer-use/com.google.Chrome',
                kind: 'app' as const,
                label: 'Chrome',
                metadata: { bundleId: 'com.google.Chrome' },
                projection: 'capability-reference' as const,
                text: 'Chrome',
            },
            {
                id: '/repo/specs/mentions.md',
                kind: 'file' as const,
                label: 'specs/mentions.md',
                projection: 'path-reference' as const,
                text: 'specs/mentions.md',
            },
            {
                id: '/repo/apps/website/src/components/ui',
                kind: 'directory' as const,
                label: 'components/ui',
                projection: 'path-reference' as const,
                text: 'components/ui',
            },
        ].map((mention) => {
            const start = content.indexOf(mention.text);
            return {
                ...mention,
                end: start + mention.text.length,
                start,
            };
        });
        const compiled = compileMentionSubmission(content, inputs);

        expect(compiled).toEqual({
            content:
                'Use [$agent-browser](skill://agent-browser) [@Computer Use](plugin://computer-use@openai-bundled) [@Chrome](app://computer-use/com.google.Chrome) [specs/mentions.md](/repo/specs/mentions.md) [components/ui](/repo/apps/website/src/components/ui)',
            mentions: [
                {
                    end: 43,
                    id: 'skill://agent-browser',
                    kind: 'skill',
                    label: 'Agent Browser',
                    projection: 'skill-activation',
                    start: 4,
                    text: '[$agent-browser](skill://agent-browser)',
                },
                {
                    end: 97,
                    id: 'plugin://computer-use@openai-bundled',
                    kind: 'plugin',
                    label: 'Computer Use',
                    projection: 'capability-reference',
                    start: 44,
                    text: '[@Computer Use](plugin://computer-use@openai-bundled)',
                },
                {
                    end: 145,
                    id: 'app://computer-use/com.google.Chrome',
                    kind: 'app',
                    label: 'Chrome',
                    metadata: { bundleId: 'com.google.Chrome' },
                    projection: 'capability-reference',
                    start: 98,
                    text: '[@Chrome](app://computer-use/com.google.Chrome)',
                },
                {
                    end: 190,
                    id: '/repo/specs/mentions.md',
                    kind: 'file',
                    label: 'specs/mentions.md',
                    projection: 'path-reference',
                    start: 146,
                    text: '[specs/mentions.md](/repo/specs/mentions.md)',
                },
                {
                    end: 244,
                    id: '/repo/apps/website/src/components/ui',
                    kind: 'directory',
                    label: 'components/ui',
                    projection: 'path-reference',
                    start: 191,
                    text: '[components/ui](/repo/apps/website/src/components/ui)',
                },
            ],
        });
    });
});
