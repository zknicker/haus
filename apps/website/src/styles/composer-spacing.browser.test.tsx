import { afterAll, beforeAll, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { type Browser, webkit } from '@playwright/test';

const require = createRequire(import.meta.url);
const promptInputCss = readFileSync(
    require.resolve('@heroui-pro/react/css/components/prompt-input.css'),
    'utf8'
);
const themeCss = readFileSync(join(import.meta.dir, 'default-theme.css'), 'utf8');
const chatCss = readFileSync(join(import.meta.dir, '../features/chats/chat.css'), 'utf8');

const iphone = { height: 844, width: 390 };
const ipad = { height: 1180, width: 820 };

let browser: Browser;

beforeAll(async () => {
    browser = await webkit.launch({ headless: true });
});

afterAll(async () => {
    await browser.close();
});

test('iPad expanded composer matches the iPhone inset, including after focus', async () => {
    const phone = await measure(iphone);
    const tablet = await measure(ipad);

    expect(tablet).toEqual(phone);
    expect(phone.boxPadding).toBe('0px');
    expect(phone.focused).toBe(true);
    expect(phone.shellHeight).toBeLessThan(90);
    expect(phone.gapToSend).toBeGreaterThanOrEqual(8);
    expect(phone.gapToSend).toBeLessThanOrEqual(14);
});

async function measure(viewport: { height: number; width: number }) {
    const page = await open(viewport);
    const resting = await page.evaluate(readSpacing);
    await page.evaluate(() => {
        const shell = document.querySelector('.prompt-input__shell');
        const box = document.querySelector('[role="textbox"]');
        shell?.addEventListener('mousedown', (event) => {
            const target = event.target;
            if (!(target instanceof Element) || !(box instanceof HTMLElement)) {
                return;
            }
            if (target.closest('button, [contenteditable]')) {
                return;
            }
            event.preventDefault();
            box.focus();
        });
    });
    const shell = page.locator('.prompt-input__shell');
    const box = await shell.boundingBox();
    if (!box) {
        throw new Error('The composer shell did not lay out.');
    }
    await page.mouse.click(box.x + 6, box.y + 4);
    const focused = await page.evaluate(readSpacing);
    await page.close();
    return { ...resting, ...focused, focused: focused.active };
}

async function open(viewport: { height: number; width: number }) {
    const page = await browser.newPage({ viewport });
    await page.setContent(`<!doctype html>
        <html>
            <head>
                <style>
                    @layer components {
                        ${promptInputCss}
                    }
                    ${themeCss}
                    ${chatCss}
                    * { box-sizing: border-box; }
                    body { margin: 0; }
                    .dock { padding: 0 calc(var(--spacing) * 5) calc(var(--spacing) * 2); }
                    .send { width: 30px; height: 30px; border: 0; border-radius: 999px; }
                </style>
            </head>
            <body>
                <div class="dock">
                    <div class="prompt-input" data-expanded data-layout="compact">
                        <div class="prompt-input__shell prompt-input__shell--compact">
                            <div class="prompt-input__content">
                                <div class="chat-composer-editor prompt-input__textarea">
                                    <div contenteditable="true" role="textbox" tabindex="0">One line</div>
                                </div>
                            </div>
                            <div class="prompt-input__toolbar">
                                <div class="prompt-input__toolbar-end">
                                    <button class="prompt-input__send send" type="button">↑</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </body>
        </html>`);
    return page;
}

function readSpacing() {
    const shell = document.querySelector('.prompt-input__shell');
    const slot = document.querySelector('.prompt-input__textarea');
    const box = document.querySelector('[role="textbox"]');
    const send = document.querySelector('.prompt-input__send');
    if (
        !(
            shell instanceof HTMLElement &&
            slot instanceof HTMLElement &&
            box instanceof HTMLElement &&
            send instanceof HTMLElement
        )
    ) {
        throw new Error('Composer parts missing.');
    }
    const shellBox = shell.getBoundingClientRect();
    const slotBox = slot.getBoundingClientRect();
    const sendBox = send.getBoundingClientRect();
    return {
        active: document.activeElement === box,
        boxPadding: getComputedStyle(box).padding,
        dockBottom: Math.round(
            (document.querySelector('.dock')?.getBoundingClientRect().bottom ?? 0) - shellBox.bottom
        ),
        gapToSend: Math.round(sendBox.top - slotBox.bottom),
        sendBottom: Math.round(shellBox.bottom - sendBox.bottom),
        shellHeight: Math.round(shellBox.height),
        slotMinHeight: getComputedStyle(slot).minHeight,
        slotPaddingTop: getComputedStyle(slot).paddingTop,
    };
}
