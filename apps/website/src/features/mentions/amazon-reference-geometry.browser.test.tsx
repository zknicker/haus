import { afterAll, beforeAll, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { type Browser, chromium, type Page } from '@playwright/test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AmazonReferenceChip } from './amazon-reference.tsx';
import { ReferenceChip } from './reference-chip.tsx';

const defaultThemeCss = readFileSync(
    new URL('../../styles/default-theme.css', import.meta.url),
    'utf8'
);
const identity = { asin: 'B07X5373W6', marketplaceId: 'ATVPDKIKX0DER' } as const;
const thumbnail =
    'data:image/svg+xml,' +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="black"/></svg>'
    );

let browser: Browser;

beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
    await browser.close();
});

test('product chips share the surrounding text baseline without growing the line', async () => {
    const product = renderToStaticMarkup(
        <AmazonReferenceChip
            lookup={{
                detailFailed: false,
                product: {
                    ...identity,
                    amazonListingStatus: 'active',
                    brand: 'Boo',
                    cutoutThumbnail: { status: 'available', url: thumbnail },
                    shortName: 'The Boo Crew',
                    thumbnail: { status: 'unavailable' },
                    title: 'The Boo Crew',
                },
                status: 'ready',
            }}
            product={identity}
        />
    );
    const mention = renderToStaticMarkup(
        <ReferenceChip
            id="agent://agt_blippy"
            kind="agent"
            label="Blippy"
            metadata={{ agentAvatarUrl: thumbnail }}
            onActivate={() => undefined}
            preview
        />
    );
    const page = await newPage(`
        <style>
            ${fixtureCss}
            ${defaultThemeCss}
        </style>
        <p class="line" id="plain">Grab a speaker before the party tonight.</p>
        <p class="line" id="para">Grab ${mention} and ${product} tonight.</p>
        <ul class="line"><li id="item">Bring ${product} along.</li></ul>
        <h3 class="line heading" id="heading">Loved ${product} this year</h3>
        <div data-theme="dark">
            <p class="line" id="dark">Dark mode still shows ${product} inline.</p>
        </div>
    `);
    const metrics = await page.evaluate(readMetrics);
    const mentionDelta = metrics.para.chips[0]?.delta;
    const productDelta = metrics.para.chips[1]?.delta;
    if (mentionDelta === undefined || productDelta === undefined) {
        throw new Error(`Missing chip baselines: mention ${mentionDelta}, product ${productDelta}`);
    }

    expect(Math.abs(productDelta - mentionDelta)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(metrics.para.height - metrics.plain.height)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(metrics.item.delta)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(metrics.item.height - metrics.plain.height)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(metrics.heading.delta)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(metrics.dark.delta - mentionDelta)).toBeLessThanOrEqual(0.5);

    await page.close();
});

function readMetrics() {
    const baselineOf = (node: Node) => {
        const probe = document.createElement('span');
        probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline;';
        if (node instanceof Text) {
            node.parentNode?.insertBefore(probe, node.nextSibling);
        } else if (node instanceof HTMLElement) {
            node.append(probe);
        }
        const y = probe.getBoundingClientRect().top;
        probe.remove();
        return y;
    };
    const lineText = (line: HTMLElement) =>
        [...line.childNodes].find((node) => node instanceof Text && node.data.trim().length > 2);
    const chipDelta = (line: HTMLElement, chip: Element) => {
        const label = chip.querySelector('[data-slot="chip-label"]');
        const text = lineText(line);
        if (!(label?.firstChild && text instanceof Text)) {
            throw new Error('Missing chip label or neighboring text.');
        }
        return baselineOf(label.firstChild) - baselineOf(text);
    };
    const readLine = (id: string) => {
        const line = document.getElementById(id);
        if (!(line instanceof HTMLElement)) {
            throw new Error(`Missing line ${id}.`);
        }
        const chips = [...line.querySelectorAll('[data-slot="chip"]')].map((chip) => ({
            delta: chipDelta(line, chip),
        }));
        const text = lineText(line);
        return {
            chips,
            delta: chips[0]?.delta ?? (text instanceof Text ? 0 : Number.NaN),
            height: line.getBoundingClientRect().height,
        };
    };

    return {
        dark: readLine('dark'),
        heading: readLine('heading'),
        item: readLine('item'),
        para: readLine('para'),
        plain: readLine('plain'),
    };
}

async function newPage(body: string): Promise<Page> {
    const page = await browser.newPage({
        deviceScaleFactor: 2,
        viewport: { height: 640, width: 980 },
    });
    await page.setContent(`<!doctype html><html><body>${body}</body></html>`);
    return page;
}

const fixtureCss = `
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; }
    button { margin: 0; border: 0; padding: 0; color: inherit; font: inherit; background: transparent; }
    a { color: inherit; }
    .line { margin: 16px; font-size: 14px; line-height: 1.625; }
    .heading { font-size: 20px; line-height: 1.4; font-weight: 600; }
    .inline-flex { display: inline-flex; }
    .align-middle { vertical-align: middle; }
    .inline-grid { display: inline-grid; }
    .size-full { width: 100%; height: 100%; }
    .object-contain { object-fit: contain; }
    .whitespace-nowrap { white-space: nowrap; }
    .max-w-full { max-width: 100%; }
    .max-w-64 { max-width: 16rem; }
    .min-w-0 { min-width: 0; }
    .truncate { overflow: hidden; text-overflow: ellipsis; }
    @layer components {
        .chip {
            display: inline-flex;
            width: fit-content;
            align-items: center;
            gap: 2px;
            padding: 1.25px 7.5px;
            font-size: 13px;
            line-height: 20px;
        }
        .chip__label { padding-inline: 1.875px; }
        .avatar { display: inline-flex; flex-shrink: 0; width: 18px; height: 18px; }
    }
`;
