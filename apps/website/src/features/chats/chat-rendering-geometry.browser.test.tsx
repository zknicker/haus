import { afterAll, beforeAll, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { type Browser, chromium, type Page } from '@playwright/test';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReferenceChip } from '../mentions/reference-chip.tsx';
import { ChatMarkdownText } from './chat-markdown-text.tsx';
import {
    ChatTranscriptMessageContent,
    renderTranscriptMessageAttachments,
    type TranscriptMessage,
} from './chat-transcript-message.tsx';
import { TranscriptMessageBlock } from './chat-transcript-message-block.tsx';

const appointmentText =
    'Your next dentist appointment is Dental Cleaning on Monday, September 28, 2026 at 10:00 AM EDT, at Meridian Dental, NYC. 🫡';
const defaultThemeCss = readFileSync(
    new URL('../../styles/default-theme.css', import.meta.url),
    'utf8'
);

let browser: Browser;

beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
    await browser.close();
});

test('streaming word lift changes paint position without changing line layout', async () => {
    const page = await newGeometryPage(`
        <style>
            ${baseTextCss}

            @keyframes chat-streaming-text-unit-in {
                from {
                    opacity: 0;
                    transform: translateY(0.45em);
                    filter: blur(1px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                    filter: blur(0);
                }
            }

            .chat-streaming-text-unit {
                display: inline-block;
                line-height: inherit;
                vertical-align: baseline;
                animation: chat-streaming-text-unit-in 720ms cubic-bezier(0.16, 1, 0.3, 1) both paused;
            }
        </style>
        <div class="case" id="plain">
            <span class="target">Dental</span>
        </div>
        <div class="case" id="streaming">
            <span class="target chat-streaming-text-unit">Dental</span>
        </div>
    `);

    const metrics = await page.evaluate(() => {
        const readMetrics = (id: string) => {
            const root = document.getElementById(id);
            const target = root?.querySelector('.target');

            if (!(root instanceof HTMLElement && target instanceof HTMLElement)) {
                throw new Error(`Missing geometry target ${id}.`);
            }

            const rootRect = root.getBoundingClientRect();
            const targetRect = target.getBoundingClientRect();

            return {
                boxHeight: rootRect.height,
                offsetTop: targetRect.top - rootRect.top,
            };
        };

        return {
            plain: readMetrics('plain'),
            streaming: readMetrics('streaming'),
        };
    });

    expect(metrics.streaming.boxHeight).toBe(metrics.plain.boxHeight);
    expect(metrics.streaming.offsetTop - metrics.plain.offsetTop).toBeGreaterThan(3);

    await page.close();
});

test('active and durable assistant reply wrappers keep the same text geometry', async () => {
    const liveMarkup = renderChatMarkup(
        <TranscriptMessageBlock from="assistant">
            <ChatMarkdownText content={appointmentText} />
        </TranscriptMessageBlock>
    );
    const durableMarkup = renderChatMarkup(
        <TranscriptMessageBlock
            attachments={renderTranscriptMessageAttachments(
                assistantMessage(appointmentText).attachments
            )}
            from="assistant"
        >
            <ChatTranscriptMessageContent message={assistantMessage(appointmentText)} />
        </TranscriptMessageBlock>
    );
    const page = await newGeometryPage(`
        <style>
            ${chatMessageCss}
        </style>
        <div class="reply-case" id="live">${liveMarkup}</div>
        <div class="reply-case" id="durable">${durableMarkup}</div>
    `);

    const metrics = await page.evaluate(() => {
        const readMetrics = (id: string) => {
            const root = document.getElementById(id);
            const body = root?.querySelector('[data-slot="chat-message-content"]');
            const textRoot = body?.querySelector('[data-selectable-text]') ?? body;

            if (
                !(
                    root instanceof HTMLElement &&
                    body instanceof HTMLElement &&
                    textRoot instanceof Node
                )
            ) {
                throw new Error(`Missing reply geometry target ${id}.`);
            }

            const rootRect = root.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(textRoot);

            const bodyRect = body.getBoundingClientRect();
            const textRect = Array.from(range.getClientRects()).find((rect) => rect.width > 0);

            if (!textRect) {
                throw new Error(`Missing text rect ${id}.`);
            }

            return {
                bodyTop: bodyRect.top - rootRect.top,
                bodyHeight: bodyRect.height,
                rootHeight: rootRect.height,
                textTop: textRect.top - bodyRect.top,
            };
        };

        return {
            durable: readMetrics('durable'),
            live: readMetrics('live'),
        };
    });

    expect(Math.abs(metrics.durable.bodyTop - metrics.live.bodyTop)).toBeLessThanOrEqual(0.5);
    expect(metrics.durable.bodyHeight).toBe(metrics.live.bodyHeight);
    expect(Math.abs(metrics.durable.rootHeight - metrics.live.rootHeight)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(metrics.durable.textTop - metrics.live.textTop)).toBeLessThanOrEqual(0.5);

    await page.close();
});

test('reference labels align with surrounding text for activated and inert chips', async () => {
    const inert = renderToStaticMarkup(
        <ReferenceChip
            id="agent://agt_blippy"
            kind="agent"
            label="orbit"
            metadata={{ agentAvatarUrl: '/blippy.png' }}
            preview
        />
    );
    const activated = renderToStaticMarkup(
        <ReferenceChip
            id="agent://agt_blippy"
            kind="agent"
            label="orbit"
            metadata={{ agentAvatarUrl: '/blippy.png' }}
            onActivate={() => undefined}
            preview
        />
    );
    const page = await newGeometryPage(`
        <style>
            ${referenceChipCss}
            ${defaultThemeCss}
        </style>
        <p class="reference-line" id="inert">Before ${inert} after</p>
        <p class="reference-line" id="activated">Before ${activated} after</p>
    `);

    const metrics = await page.evaluate(() => {
        const readMetrics = (id: string) => {
            const line = document.getElementById(id);
            const chip = line?.querySelector('[data-slot="chip"]');
            const label = chip?.querySelector('[data-slot="chip-label"]');
            const mark = chip?.querySelector('.avatar');

            if (
                !(
                    line instanceof HTMLElement &&
                    chip instanceof HTMLElement &&
                    label instanceof HTMLElement &&
                    mark instanceof HTMLElement
                )
            ) {
                throw new Error(`Missing reference geometry target ${id}.`);
            }

            const referenceNode =
                chip.closest('[data-slot="hover-card-trigger"]') ??
                (chip.parentElement instanceof HTMLButtonElement ? chip.parentElement : chip);
            const adjacentText = referenceNode.nextSibling;

            if (!(adjacentText instanceof Text)) {
                throw new Error(`Missing adjacent reference text for ${id}.`);
            }

            const lineRect = line.getBoundingClientRect();
            const chipRect = chip.getBoundingClientRect();
            const chipStyle = getComputedStyle(chip);
            const labelStyle = getComputedStyle(label);
            const referenceStyle = getComputedStyle(referenceNode);
            const labelRange = document.createRange();
            labelRange.selectNodeContents(label);
            const adjacentRange = document.createRange();
            const adjacentWordStart = adjacentText.data.indexOf('after');
            adjacentRange.setStart(adjacentText, adjacentWordStart);
            adjacentRange.setEnd(adjacentText, adjacentWordStart + 'after'.length);
            const adjacentTextRect = adjacentRange.getBoundingClientRect();
            const labelTextRect = labelRange.getBoundingClientRect();

            return {
                adjacentTextTop: adjacentTextRect.top - lineRect.top,
                chipFontSize: chipStyle.fontSize,
                chipHeight: chipRect.height,
                chipLineHeight: chipStyle.lineHeight,
                chipPaddingEnd: chipStyle.paddingInlineEnd,
                chipPaddingStart: chipStyle.paddingInlineStart,
                chipTop: chipRect.top - lineRect.top,
                gap: chipStyle.gap,
                labelBackgroundImage: labelStyle.backgroundImage,
                labelBackgroundSize: labelStyle.backgroundSize,
                labelTextOffset: labelTextRect.top - adjacentTextRect.top,
                labelTextTop: labelTextRect.top - lineRect.top,
                labelFontWeight: labelStyle.fontWeight,
                labelPaddingBottom: labelStyle.paddingBottom,
                labelTransform: labelStyle.transform,
                lineHeight: lineRect.height,
                markHeight: mark.getBoundingClientRect().height,
                markTextOffset: mark.getBoundingClientRect().top - adjacentTextRect.top,
                referenceVerticalAlign: referenceStyle.verticalAlign,
            };
        };

        return {
            activated: readMetrics('activated'),
            inert: readMetrics('inert'),
        };
    });
    const underlinePixels = await readVisibleUnderlinePixels(page);

    expect(metrics.activated.chipHeight).toBe(metrics.inert.chipHeight);
    expect(metrics.activated.lineHeight).toBe(metrics.inert.lineHeight);
    expect(Math.abs(metrics.activated.chipTop - metrics.inert.chipTop)).toBeLessThanOrEqual(0.5);
    // Font metrics differ between the headless Linux browser and the macOS app.
    // The wrapper alignment is the portable contract; these bounds still catch
    // the five-pixel lift caused by the former baseline-aligned wrapper.
    expect(Math.abs(metrics.activated.labelTextOffset)).toBeLessThanOrEqual(2.25);
    expect(Math.abs(metrics.inert.labelTextOffset)).toBeLessThanOrEqual(2.25);
    expect(Math.abs(metrics.activated.markTextOffset)).toBeLessThanOrEqual(2.75);
    expect(Math.abs(metrics.inert.markTextOffset)).toBeLessThanOrEqual(2.75);
    expect(metrics.inert.lineHeight).toBeLessThanOrEqual(27);
    expect(metrics.inert).toMatchObject({
        chipFontSize: '15px',
        chipHeight: 18,
        chipLineHeight: '15px',
        chipPaddingEnd: '0px',
        chipPaddingStart: '0px',
        gap: '3.75px',
        labelBackgroundSize: '3.6px 1.8px',
        labelFontWeight: '700',
        labelPaddingBottom: '3px',
        labelTransform: 'none',
        markHeight: 18,
        referenceVerticalAlign: 'middle',
    });
    expect(metrics.inert.labelBackgroundImage).not.toBe('none');
    expect(underlinePixels.visibleInkPixels).toBeGreaterThan(12);

    await page.close();
});

test('cursor hover cards track and exit without motion', async () => {
    const page = await newGeometryPage(`
        <style>${defaultThemeCss}</style>
        <div
            class="hover-card__content cursor-hover-card"
            data-exiting="true"
            id="hover-card"
            style="--cursor-hover-x: 12px; --cursor-hover-y: -4px"
        ></div>
    `);

    const motion = await page.evaluate(() => {
        const card = document.getElementById('hover-card');

        if (!(card instanceof HTMLElement)) {
            throw new Error('Missing cursor hover-card target.');
        }

        const style = getComputedStyle(card);
        return {
            animationName: style.animationName,
            transitionDuration: style.transitionDuration,
            transitionProperty: style.transitionProperty,
            translate: style.translate,
        };
    });

    expect(motion).toEqual({
        animationName: 'none',
        transitionDuration: '0s',
        transitionProperty: 'none',
        translate: '12px -4px',
    });

    await page.close();
});

test('contrast cursor hover cards stay dark in both app themes', async () => {
    const page = await newGeometryPage(`
        <style>
            :root {
                --eclipse: oklch(21.03% 0.0059 285.89);
                --snow: oklch(99.11% 0 0);
            }
            ${defaultThemeCss}
            .hover-card__content {
                background: var(--overlay);
                color: var(--overlay-foreground);
            }
        </style>
        <div class="light" id="light">
            <div class="hover-card__content cursor-hover-card--contrast reference-hover-card">
                <div class="reference-hover-card__identity">Channel</div>
                <div class="reference-hover-card__faces"><span class="avatar"></span></div>
            </div>
        </div>
        <div class="dark" data-theme="dark" id="dark">
            <div class="hover-card__content cursor-hover-card--contrast reference-hover-card">
                <div class="reference-hover-card__identity">Skill</div>
                <div class="reference-hover-card__faces"><span class="avatar"></span></div>
            </div>
        </div>
    `);

    const appearances = await page.evaluate(() => {
        const getAppearance = (id: string) => {
            const card = document.querySelector(`#${id} .hover-card__content`);
            if (!(card instanceof HTMLElement)) {
                throw new Error(`Missing contrast hover-card target ${id}.`);
            }

            const style = getComputedStyle(card);
            const identity = card.querySelector('.reference-hover-card__identity');
            const faces = card.querySelector('.reference-hover-card__faces');
            const mark = card.querySelector('.reference-hover-card__faces .avatar');
            const cardBounds = card.getBoundingClientRect();
            const identityBounds = identity?.getBoundingClientRect();
            const facesBounds = faces?.getBoundingClientRect();
            return {
                backgroundColor: style.backgroundColor,
                color: style.color,
                colorScheme: style.colorScheme,
                facesInset: facesBounds === undefined ? null : facesBounds.left - cardBounds.left,
                identityInset:
                    identityBounds === undefined ? null : identityBounds.left - cardBounds.left,
                markSeparator: mark === null ? null : getComputedStyle(mark).boxShadow,
                padding: style.padding,
            };
        };

        return {
            dark: getAppearance('dark'),
            light: getAppearance('light'),
        };
    });

    expect(appearances.dark).toEqual(appearances.light);
    expect(appearances.light).toEqual({
        backgroundColor: 'oklch(0.2103 0.0059 285.89)',
        color: 'oklch(0.9911 0 0)',
        colorScheme: 'dark',
        // Both mark columns start on the same optical edge, and each stacked
        // mark is ringed in the card's own surface so overlaps stay legible.
        facesInset: 10.25,
        identityInset: 10.25,
        markSeparator: 'oklch(0.2103 0.0059 285.89) 0px 0px 0px 2px',
        padding: '11.25px',
    });

    await page.close();
});

test('channel reference labels use the configured channel color', async () => {
    const markup = renderToStaticMarkup(
        <ReferenceChip
            id="chat://cht_product"
            kind="chat"
            label="product"
            metadata={{ chatColor: 'violet', chatIcon: 'RocketIcon' }}
            preview
        />
    );
    const page = await newGeometryPage(`
        <style>
            ${referenceChipCss}
            ${defaultThemeCss}
        </style>
        <div class="light" id="light">${markup}</div>
        <div class="dark" data-theme="dark" id="dark">${markup}</div>
    `);

    const colors = await page.evaluate(() => {
        const getChipColor = (id: string) => {
            const chip = document.querySelector(`#${id} [data-slot="chip"]`);

            if (!(chip instanceof HTMLElement)) {
                throw new Error(`Missing channel color target ${id}.`);
            }

            return getComputedStyle(chip).color;
        };

        return {
            dark: getChipColor('dark'),
            light: getChipColor('light'),
        };
    });

    expect(colors).toEqual({
        dark: 'rgb(167, 139, 250)',
        light: 'rgb(124, 58, 237)',
    });

    await page.close();
});

test('work disclosure anchoring keeps the header pinned while content expands below it', async () => {
    const page = await newGeometryPage(`
        <style>
            ${baseTextCss}

            .scroll-case {
                height: 220px;
                margin: 24px;
                overflow-y: auto;
                border: 1px solid #ddd;
            }

            .spacer-before {
                height: 260px;
            }

            .spacer-after {
                height: 520px;
            }

            .work-header {
                height: 32px;
                display: flex;
                align-items: center;
                padding: 0 12px;
                background: #f5f5f5;
            }

            .work-panel {
                height: 0;
                overflow: hidden;
                background: #fafafa;
            }
        </style>
        <div class="scroll-case" id="scroll-case">
            <div class="spacer-before"></div>
            <button class="work-header" id="work-header" type="button">Read 2 files</button>
            <div class="work-panel" id="work-panel"></div>
            <div class="spacer-after"></div>
        </div>
    `);

    const metrics = await page.evaluate(() => {
        const viewport = document.getElementById('scroll-case');
        const header = document.getElementById('work-header');
        const panel = document.getElementById('work-panel');

        if (
            !(
                viewport instanceof HTMLElement &&
                header instanceof HTMLElement &&
                panel instanceof HTMLElement
            )
        ) {
            throw new Error('Missing work disclosure geometry target.');
        }

        viewport.scrollTop = header.offsetTop - 92;

        const beforeHeaderRect = header.getBoundingClientRect();
        const capturedTop = beforeHeaderRect.top;
        panel.style.height = '220px';

        // Simulate the competing end-follow adjustment that used to yank the
        // clicked header upward when a virtualized row grew below it.
        viewport.scrollTop += 220;
        const yankedTop = header.getBoundingClientRect().top;

        const delta = header.getBoundingClientRect().top - capturedTop;
        viewport.scrollTop += delta;

        const afterHeaderRect = header.getBoundingClientRect();
        const afterPanelRect = panel.getBoundingClientRect();

        return {
            afterHeaderBottom: afterHeaderRect.bottom,
            afterHeaderTop: afterHeaderRect.top,
            afterPanelHeight: afterPanelRect.height,
            afterPanelTop: afterPanelRect.top,
            beforeHeaderTop: beforeHeaderRect.top,
            yankedTop,
        };
    });

    expect(metrics.yankedTop).toBeLessThan(metrics.beforeHeaderTop - 160);
    expect(Math.abs(metrics.afterHeaderTop - metrics.beforeHeaderTop)).toBeLessThanOrEqual(0.5);
    expect(metrics.afterPanelHeight).toBe(220);
    expect(metrics.afterPanelTop).toBeGreaterThanOrEqual(metrics.afterHeaderBottom - 0.5);

    await page.close();
});

function renderChatMarkup(node: ReactNode): string {
    return renderToStaticMarkup(node);
}

async function newGeometryPage(body: string): Promise<Page> {
    const page = await browser.newPage({
        deviceScaleFactor: 2,
        viewport: { height: 360, width: 1200 },
    });

    await page.setContent(`<!doctype html><html><body>${body}</body></html>`);

    return page;
}

async function readVisibleUnderlinePixels(page: Page) {
    const screenshot = await page
        .locator('#inert [data-slot="chip-label"]')
        .screenshot({ animations: 'disabled' });
    const source = `data:image/png;base64,${screenshot.toString('base64')}`;

    return page.evaluate(async (imageSource) => {
        const image = new Image();
        image.src = imageSource;
        await image.decode();

        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d');

        if (!context) {
            throw new Error('Missing pixel inspection context.');
        }

        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, image.width, image.height).data;
        const firstUnderlineRow = Math.max(0, image.height - 6);
        let visibleInkPixels = 0;

        for (let y = firstUnderlineRow; y < image.height; y += 1) {
            for (let x = 0; x < image.width; x += 1) {
                const offset = (y * image.width + x) * 4;
                const red = pixels[offset] ?? 255;
                const green = pixels[offset + 1] ?? 255;
                const blue = pixels[offset + 2] ?? 255;
                const alpha = pixels[offset + 3] ?? 0;
                const brightness = (red + green + blue) / 3;

                if (alpha > 128 && brightness < 200) {
                    visibleInkPixels += 1;
                }
            }
        }

        return {
            height: image.height,
            visibleInkPixels,
            width: image.width,
        };
    }, source);
}

const baseTextCss = `
    body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 14px;
    }

    .case {
        min-height: 20px;
        margin: 40px;
        color: #111;
        font-size: 14px;
        line-height: 1.5;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
    }
`;

const chatMessageCss = `
    ${baseTextCss}

    p {
        margin: 0;
    }

    .reply-case {
        margin: 40px;
    }

    .group {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        min-width: 0;
        max-width: 100%;
        gap: 6px;
        font-size: 14px;
        line-height: 1.5;
    }

    .max-w-full {
        max-width: 100%;
    }

    .whitespace-pre-wrap {
        white-space: pre-wrap;
    }

    .break-words {
        word-break: normal;
        overflow-wrap: anywhere;
    }

    .text-sm {
        font-size: 14px;
        line-height: 1.5;
    }

    /* Mirrors the stock chat-message__content type scale. */
    .chat-message__content {
        font-size: 14px;
        line-height: 1.5;
    }
`;

const referenceChipCss = `
    * {
        box-sizing: border-box;
    }

    body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    button {
        margin: 0;
        border: 0;
        padding: 0;
        color: inherit;
        font: inherit;
        background: transparent;
    }

    .reference-line {
        margin: 24px;
        font-size: 15px;
        line-height: 1.625;
    }

    .inline-flex {
        display: inline-flex;
    }

    .align-middle {
        vertical-align: middle;
    }

    @layer components {
        .chip {
            display: inline-flex;
            width: fit-content;
            align-items: center;
            gap: 2px;
            padding: 1.25px 7.5px;
            --chip-fg: currentColor;
            color: var(--chip-fg);
            font-size: 13px;
            line-height: 20px;
        }

        .chip--default {
            --chip-fg: var(--default-foreground);
        }

        .chip__label {
            padding-inline: 1.875px;
        }
    }

    .avatar {
        display: inline-flex;
        flex-shrink: 0;
    }
`;

function assistantMessage(content: string): TranscriptMessage {
    return {
        attachments: [],
        content,
        id: 'msg_assistant_geometry',
        metadata: { runtime: { runId: 'run_geometry' } },
        sender: 'Agent',
        senderType: 'agent',
        sourceSessionId: null,
        sourceSessionKey: 'agent:main:haus:channel:geometry',
        hausAgentId: 'agt_main',
        timestamp: '2026-06-18T20:35:17.000Z',
    };
}
