import { describe, expect, it } from 'bun:test';
import {
    formatAgentReferenceTarget,
    formatAppReferenceTarget,
    formatChatReferenceTarget,
    formatChatThreadReferenceTarget,
    formatSkillReferenceTarget,
    parseAgentReferenceTarget,
    parseAppReferenceTarget,
    parseChatReferenceTarget,
    parseChatThreadReferenceTarget,
    parseHausRichReferences,
    parseSkillReferenceTarget,
    parseUserReferenceTarget,
} from './rich-references.ts';

describe('Haus rich references', () => {
    it('keeps thread navigation ids separate from readable labels', () => {
        const target = formatChatThreadReferenceTarget('cht:product', 'msg:anchor');
        expect(target).toBe('chat://cht%3Aproduct?thread=msg%3Aanchor');
        expect(parseChatReferenceTarget(target)).toBe('cht:product');
        expect(parseChatThreadReferenceTarget(target)).toEqual({
            chatId: 'cht:product',
            anchorMessageId: 'msg:anchor',
        });
        expect(parseHausRichReferences(`[#product thread](${target})`)[0]).toMatchObject({
            kind: 'chat',
            label: 'product thread',
        });
        for (const invalid of [
            'chat://cht?thread=',
            'chat://cht?thread=%XX',
            'chat://cht?thread=msg&other=1',
            'chat://cht?other=msg',
        ]) {
            expect(parseChatReferenceTarget(invalid)).toBeNull();
            expect(parseChatThreadReferenceTarget(invalid)).toBeNull();
        }
    });
    it('formats and parses stable agent, app, and skill targets', () => {
        expect(formatAgentReferenceTarget('agent:planner')).toBe('agent://agent%3Aplanner');
        expect(parseAgentReferenceTarget('agent://agent%3Aplanner')).toBe('agent:planner');

        expect(formatAppReferenceTarget('com.google.Chrome')).toBe(
            'app://computer-use/com.google.Chrome'
        );
        expect(parseAppReferenceTarget('app://computer-use/com.google.Chrome')).toBe(
            'com.google.Chrome'
        );

        expect(formatSkillReferenceTarget('agent-browser')).toBe('skill://agent-browser');
        expect(parseSkillReferenceTarget('skill://agent-browser')).toBe('agent-browser');

        expect(formatChatReferenceTarget('cht_product')).toBe('chat://cht_product');
        expect(parseChatReferenceTarget('chat://cht_product')).toBe('cht_product');
    });

    it('parses explicit markdown links into rich references', () => {
        const content =
            'Ask [@Planner](agent://agent%3Aplanner), use [$ui](skill://ui), open [@Chrome](app://computer-use/com.google.Chrome), jump to [#product](chat://cht_product), and inspect [specs/mentions.md](/repo/specs/mentions.md).';

        expect(parseHausRichReferences(content)).toEqual([
            {
                end: 39,
                id: 'agent://agent%3Aplanner',
                kind: 'agent',
                label: 'Planner',
                projection: 'agent-reference',
                start: 4,
                text: '[@Planner](agent://agent%3Aplanner)',
            },
            {
                end: 62,
                id: 'skill://ui',
                kind: 'skill',
                label: 'ui',
                projection: 'skill-activation',
                start: 45,
                text: '[$ui](skill://ui)',
            },
            {
                end: 116,
                id: 'app://computer-use/com.google.Chrome',
                kind: 'app',
                label: 'Chrome',
                projection: 'capability-reference',
                start: 69,
                text: '[@Chrome](app://computer-use/com.google.Chrome)',
            },
            {
                end: 156,
                id: 'chat://cht_product',
                kind: 'chat',
                label: 'product',
                projection: 'chat-reference',
                start: 126,
                text: '[#product](chat://cht_product)',
            },
            {
                end: 214,
                id: '/repo/specs/mentions.md',
                kind: 'file',
                label: 'specs/mentions.md',
                projection: 'path-reference',
                start: 170,
                text: '[specs/mentions.md](/repo/specs/mentions.md)',
            },
        ]);
    });

    it('leaves bare mention-looking text unparsed', () => {
        expect(parseHausRichReferences('@Planner $ui B0TESTASIN')).toEqual([]);
    });

    it('parses explicit user references', () => {
        expect(parseUserReferenceTarget('user://usr_haus')).toBe('usr_haus');
        expect(parseHausRichReferences('Ask [@You](user://usr_haus).')).toEqual([
            expect.objectContaining({
                id: 'user://usr_haus',
                kind: 'user',
                label: 'You',
            }),
        ]);
    });

    it('parses skill targets independently from filesystem paths', () => {
        const content = 'Use [$space-skill](skill://space-skill) now.';

        expect(parseHausRichReferences(content)).toEqual([
            {
                end: 39,
                id: 'skill://space-skill',
                kind: 'skill',
                label: 'space-skill',
                projection: 'skill-activation',
                start: 4,
                text: '[$space-skill](skill://space-skill)',
            },
        ]);
    });

    it('treats explicit SKILL.md paths as file references, not skill activations', () => {
        const content = 'Read [$ui](/Users/zknicker/.agents/skills/ui/SKILL.md).';

        expect(parseHausRichReferences(content)).toEqual([
            {
                end: 54,
                id: '/Users/zknicker/.agents/skills/ui/SKILL.md',
                kind: 'file',
                label: 'ui',
                projection: 'path-reference',
                start: 5,
                text: '[$ui](/Users/zknicker/.agents/skills/ui/SKILL.md)',
            },
        ]);
    });
});
