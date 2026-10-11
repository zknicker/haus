import { describe, expect, it } from 'bun:test';
import { chatMessageSchema, chatSendInputSchema } from './chat.ts';
import { activeCloudAgentWorkLocationSchema, activeCloudAgentWorkSchema } from './cloud-agent.ts';
import { cloudAgentTitleMaxLength } from './cloud-agent-shared.ts';
import {
    activeWorkLocations,
    cloudAgentWorkLinkLabelCases,
    linkedMessage,
    linkedWork,
    linkedWorkLink,
} from './cloud-agent-work-fixture.ts';
import {
    chatMessageAuthoredContentMaxLength,
    chatMessageContentMaxLength,
    cloudAgentWorkLinkFallbackLabel,
    cloudAgentWorkLinkLabel,
    cloudAgentWorkLinkSuffixMaxLength,
    formatCloudAgentWorkLink,
} from './cloud-agent-work-link.ts';
import {
    formatCloudAgentWorkReferenceTarget,
    parseCloudAgentWorkReferenceTarget,
    parseHausRichReferences,
} from './rich-references.ts';

describe('Cloud Agent work links', () => {
    it('formats the target and parses it back by immutable id', () => {
        expect(formatCloudAgentWorkReferenceTarget('caw_a:b')).toBe('cloud-agent://caw_a%3Ab');
        expect(parseCloudAgentWorkReferenceTarget('cloud-agent://caw_a%3Ab')).toBe('caw_a:b');
        expect(parseCloudAgentWorkReferenceTarget('cloud-agent://')).toBeNull();
        expect(parseCloudAgentWorkReferenceTarget('cloud-agent://%XX')).toBeNull();
        expect(parseCloudAgentWorkReferenceTarget('chat://caw_1')).toBeNull();
    });

    it('writes each sanitized label and parses it back to the work', () => {
        for (const { title, label } of cloudAgentWorkLinkLabelCases) {
            expect(cloudAgentWorkLinkLabel(title)).toBe(label);
            const link = formatCloudAgentWorkLink(title, linkedWork.id);
            expect(link).toBe(`[${label}](cloud-agent://${linkedWork.id})`);
            const [reference, ...rest] = parseHausRichReferences(`Before ${link} after`);
            expect(rest).toEqual([]);
            expect(reference).toMatchObject({
                end: 7 + link.length,
                id: `cloud-agent://${linkedWork.id}`,
                kind: 'cloud-agent-work',
                label: label.replace(/\\([\\[])/gu, '$1'),
                projection: 'cloud-agent-work-reference',
                start: 7,
                text: link,
            });
            expect(link.length + 2).toBeLessThanOrEqual(cloudAgentWorkLinkSuffixMaxLength);
        }
    });

    it('never writes an empty label', () => {
        for (const title of ['', '   ', ']', '\r\n', ' ]\n] ']) {
            expect(cloudAgentWorkLinkLabel(title)).toBe(cloudAgentWorkLinkFallbackLabel);
        }
    });

    it('clips a label to the title bound by code point', () => {
        const label = cloudAgentWorkLinkLabel('🚀'.repeat(cloudAgentTitleMaxLength + 5));
        expect(Array.from(label)).toHaveLength(cloudAgentTitleMaxLength);
    });

    it('refuses a work id that would break the suffix bound', () => {
        expect(() => formatCloudAgentWorkLink('Title', ' ')).toThrow();
        expect(() => formatCloudAgentWorkLink('Title', 'x'.repeat(65))).toThrow();
        expect(formatCloudAgentWorkLink('Title', 'x'.repeat(64))).toContain('x'.repeat(64));
    });

    it('bounds stored content as authored text plus one trusted link', () => {
        expect(chatMessageAuthoredContentMaxLength).toBe(32_000);
        expect(chatMessageContentMaxLength).toBe(
            chatMessageAuthoredContentMaxLength + cloudAgentWorkLinkSuffixMaxLength
        );
        const longest = formatCloudAgentWorkLink('\\'.repeat(120), 'x'.repeat(64));
        expect(`\n\n${longest}`.length).toBe(cloudAgentWorkLinkSuffixMaxLength);

        const authored = 'a'.repeat(chatMessageAuthoredContentMaxLength);
        expect(chatSendInputSchema.safeParse(send(authored)).success).toBe(true);
        expect(chatSendInputSchema.safeParse(send(`${authored}a`)).success).toBe(false);
        const stored = `${authored}\n\n${longest}`;
        expect(chatMessageSchema.parse({ ...linkedMessage, content: stored }).content).toBe(stored);
    });
});

describe('Cloud Agent work Message annotation', () => {
    it('defaults to no linked work', () => {
        const { cloudAgentWork: _omitted, ...wire } = linkedMessage;
        expect(chatMessageSchema.parse(wire).cloudAgentWork).toEqual([]);
    });

    it('carries linked work in link order', () => {
        expect(chatMessageSchema.parse(linkedMessage).cloudAgentWork).toEqual([linkedWork]);
        expect(parseHausRichReferences(linkedMessage.content)).toHaveLength(1);
        expect(linkedMessage.content.endsWith(`\n\n${linkedWorkLink}`)).toBe(true);
    });
});

describe('Happening now location', () => {
    it('accepts both arms and rejects mixed shapes', () => {
        for (const location of Object.values(activeWorkLocations)) {
            expect(activeCloudAgentWorkLocationSchema.parse(location)).toEqual(location);
        }
        expect(
            activeCloudAgentWorkLocationSchema.safeParse({
                ...activeWorkLocations.workThread,
                messageId: 'msg_x',
            }).success
        ).toBe(false);
    });

    it('stays optional beside the released fields', () => {
        const row = {
            chatKind: 'channel',
            chatName: 'product',
            chatPeerUserId: null,
            conversationChatId: linkedWork.chatId,
            message: linkedMessage,
            threadAnchorMessage: null,
            threadChatId: 'cht_work_thread',
            work: linkedWork,
        };
        expect(activeCloudAgentWorkSchema.parse(row).location).toBeUndefined();
        const located = { ...row, location: activeWorkLocations.message };
        expect(activeCloudAgentWorkSchema.parse(located).location).toEqual(
            activeWorkLocations.message
        );
    });
});

function send(content: string) {
    return { chatId: 'cht_product', content, nonce: 'nonce_1', serverId: 'srv_studio' };
}
