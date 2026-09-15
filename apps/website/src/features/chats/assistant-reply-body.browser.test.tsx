import { afterAll, beforeAll, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { type Browser, chromium } from '@playwright/test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AssistantReplyBody } from './assistant-reply-body.tsx';
import type { TranscriptMessage } from './chat-transcript-message.tsx';

const proCss = readFileSync(
    new URL('../../../node_modules/@heroui-pro/react/dist/css/index.css', import.meta.url),
    'utf8'
);
const themeCss = readFileSync(new URL('../../styles/default-theme.css', import.meta.url), 'utf8');
const chatCss = readFileSync(new URL('./chat.css', import.meta.url), 'utf8');
let browser: Browser;

beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
    await browser.close();
});

for (const list of ['- One\n- Two', '1. One\n2. Two']) {
    test(`Markdown preserves paragraph and list spacing: ${list[0]}`, async () => {
        const page = await renderReply(
            `First paragraph.\n\nSecond paragraph.\n\n${list}\n\nFinal sentence.`
        );
        const metrics = await page.evaluate(() => {
            const blocks = [...document.querySelectorAll('.markdown__block:not(:empty)')];
            return blocks.map((block, index) => {
                const next = blocks[index + 1];
                const child = block.lastElementChild;
                if (!child) {
                    throw new Error('Missing Markdown block content.');
                }
                return next
                    ? next.getBoundingClientRect().top - child.getBoundingClientRect().bottom
                    : Number.parseFloat(getComputedStyle(child).marginBottom);
            });
        });
        expect(metrics).toEqual([12, 12, 12, 0]);
        await page.close();
    });
}

test('visuals retain their authored position and paragraph-sized gaps on both sides', async () => {
    const page = await renderReply(
        'Before chart.\n\n```visual First chart\n<p>Chart one</p>\n```\n\nAfter chart.\n\n```visual Second chart\n<p>Chart two</p>\n```'
    );
    const metrics = await page.evaluate(() => {
        const segments = [...document.querySelectorAll('.chat-reply-segments > *')];
        return segments.map((segment, index) => ({
            label: segment.querySelector('iframe')?.title ?? segment.textContent,
            gap:
                index === 0
                    ? 0
                    : segment.getBoundingClientRect().top -
                      (segments[index - 1]?.getBoundingClientRect().bottom ?? 0),
        }));
    });
    expect(metrics).toEqual([
        { label: 'Before chart.', gap: 0 },
        { label: 'First chart', gap: 12 },
        { label: 'After chart.', gap: 12 },
        { label: 'Second chart', gap: 12 },
    ]);
    await page.close();
});

for (const content of [
    '```visual Only chart\n<p>Chart</p>\n```',
    'Intro.\n\n```visual Chart\n<p>Chart</p>\n```\n\nConclusion.',
    '```visual First\n<p>One</p>\n```\n\n```visual Second\n<p>Two</p>\n```',
]) {
    test(`attachments render once after all prose and visuals: ${content.slice(0, 25)}`, async () => {
        const page = await renderReply(content, [
            {
                type: 'file',
                filename: 'report.txt',
                path: '/workbench/report.txt',
            },
        ]);
        expect(await page.locator('.chat-message__media').count()).toBe(1);
        expect(await page.locator('.chat-message__media').textContent()).toContain('report.txt');
        expect(
            await page.evaluate(() => {
                const media = document.querySelector('.chat-message__media');
                const body = document.querySelector('.chat-reply-segments');
                return media && body
                    ? body.compareDocumentPosition(media) & Node.DOCUMENT_POSITION_FOLLOWING
                    : 0;
            })
        ).toBeTruthy();
        expect(await page.locator('.chat-reply-segments > *').count()).toBe(
            content.startsWith('Intro.') ? 3 : content.includes('Second') ? 2 : 1
        );
        await page.close();
    });
}

test('an open streaming visual renders after its introduction without exposing its fence', async () => {
    const page = await renderReply('Introduction.\n\n```visual In progress\n<p>Partial');
    expect(await page.locator('iframe').getAttribute('title')).toBe('In progress');
    expect(await page.locator('.chat-reply-segments > :first-child').textContent()).toBe(
        'Introduction.'
    );
    expect(await page.locator('.chat-reply-segments').textContent()).not.toContain('```visual');
    await page.close();
});

test('an empty failed message retains its error presentation', () => {
    const markup = renderToStaticMarkup(
        <AssistantReplyBody
            message={{
                content: '',
                id: 'failed-message',
                sender: 'Juniper',
                senderType: 'agent',
                hausAgentId: 'juniper',
                sourceSessionId: null,
                sourceSessionKey: 'agent:juniper',
                timestamp: '2026-09-14T18:05:00Z',
                metadata: { stopReason: 'error' },
            }}
        />
    );
    expect(markup).toContain('Error - session ended unexpectedly');
});

async function renderReply(content: string, attachments: TranscriptMessage['attachments'] = []) {
    const message: TranscriptMessage = {
        attachments,
        content,
        id: 'message-spacing',
        hausAgentId: 'juniper',
        sender: 'Juniper',
        senderType: 'agent',
        sourceSessionId: null,
        sourceSessionKey: 'agent:juniper',
        timestamp: '2026-09-14T18:05:00Z',
    };
    const markup = renderToStaticMarkup(<AssistantReplyBody message={message} />);
    const page = await browser.newPage();
    await page.setContent(`<style>
        @layer theme, base, components, utilities;
        @layer base { * { margin: 0; box-sizing: border-box; } }
        ${proCss}
        ${themeCss}
        ${chatCss}
        :root { --spacing: 4px; }
    </style>${markup}`);
    return page;
}
