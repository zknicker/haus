import { afterAll, beforeAll, expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { type Browser, chromium } from '@playwright/test';

let browser: Browser;
let bundle: string;

beforeAll(async () => {
    const result = await Bun.build({
        entrypoints: ['message-menu-fixture'],
        target: 'browser',
        plugins: [
            {
                name: 'message-menu-fixture',
                setup(build) {
                    build.onResolve({ filter: /^react\/jsx(?:-dev)?-runtime$/u }, ({ path }) => ({
                        path: fileURLToPath(import.meta.resolve(path)),
                    }));
                    build.onResolve({ filter: /^message-menu-fixture$/u }, () => ({
                        path: 'fixture',
                        namespace: 'fixture',
                    }));
                    build.onLoad({ filter: /.*/u, namespace: 'fixture' }, () => ({
                        loader: 'tsx',
                        contents: `
                        import { createRoot } from ${JSON.stringify(fileURLToPath(import.meta.resolve('react-dom/client')))};
                        import { MessageContextMenu } from ${JSON.stringify(`${import.meta.dir}/message-context-menu.tsx`)};
                        const row = {
                            id: 'message-1', kind: 'message', actor: null,
                            message: { id: 'message-1', content: 'Full message',
                                sender: 'Zach', senderType: 'human', timestamp: '2026-10-23T19:00:00Z' }
                        };
                        createRoot(document.getElementById('root')).render(
                            <MessageContextMenu row={row}>
                                <a href="https://example.com/front?q=one#preview"><strong>Front</strong></a>
                                <a href="/back">Back</a>
                                <p>Plain text</p>
                            </MessageContextMenu>
                        );
                    `,
                    }));
                },
            },
        ],
    });
    if (!result.success) {
        throw new AggregateError(result.logs, 'Could not build message menu fixture');
    }
    bundle = await new Response(result.outputs[0]).text();
    browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
    await browser?.close();
});

test('Copy link uses the clicked destination and resets for plain text', async () => {
    const page = await browser.newPage();
    try {
        await page.route('https://haus.test/**', (route) => {
            const script = route.request().url().endsWith('/fixture.js');
            return route.fulfill({
                contentType: script ? 'application/javascript' : 'text/html',
                body: script
                    ? bundle
                    : '<div id="root"></div><script type="module" src="/fixture.js"></script>',
            });
        });
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'clipboard', {
                value: {
                    writeText: (value: string) => {
                        document.documentElement.dataset.copied = value;
                        return Promise.resolve();
                    },
                },
            });
        });
        await page.goto('https://haus.test/');
        await page.getByText('Front', { exact: true }).click({ button: 'right' });
        await page.getByRole('menuitem', { name: 'Copy link', exact: true }).click();
        expect(await page.locator('html').getAttribute('data-copied')).toBe(
            'https://example.com/front?q=one#preview'
        );

        await page.getByText('Back', { exact: true }).click({ button: 'right' });
        await page.getByRole('menuitem', { name: 'Copy link', exact: true }).click();
        expect(await page.locator('html').getAttribute('data-copied')).toBe(
            'https://haus.test/back'
        );

        await page.getByText('Plain text', { exact: true }).click({ button: 'right' });
        expect(await page.getByRole('menuitem', { name: 'Copy link', exact: true }).count()).toBe(
            0
        );
        await page.getByRole('menuitem', { name: 'Copy message', exact: true }).click();
        expect(await page.locator('html').getAttribute('data-copied')).toBe('Full message');
    } finally {
        await page.close();
    }
}, 30_000);
