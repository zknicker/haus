import { deflateSync } from 'node:zlib';
import { createAppTestFixture, signInAsAppHuman } from '../support/app-session.ts';
import {
    assertOpaqueId,
    completeOnboarding,
    createClient,
    openChannel,
} from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test.beforeAll(async () => {
    const { accessToken, databaseUrl } = await createAppTestFixture();
    const owner = createClient(accessToken);
    // A worker restarted after a failure runs this again against the same stack.
    const existing = await owner.server.bySlug
        .query({ slug: 'attachment-images' })
        .catch(() => null);
    if (existing) {
        return;
    }
    await owner.server.create.mutate({
        displayName: 'Attachment Images',
        slug: 'attachment-images',
    });
    const server = await owner.server.bySlug.query({ slug: 'attachment-images' });
    assertOpaqueId(server.id);
    completeOnboarding(databaseUrl, server.id);
});

test('an image send renders as an image while pending and after the Server confirms it', async ({
    page,
}) => {
    await signInAsAppHuman(page);
    await page.goto('/s/attachment-images');
    await openChannel(page, 'all');

    // Hold the byte upload so the pending row is observable.
    let releaseUpload: () => void = () => undefined;
    const uploadHeld = new Promise<void>((resolve) => {
        releaseUpload = resolve;
    });
    await page.route('**/attachments/**', async (route) => {
        if (route.request().method() === 'PUT') {
            await uploadHeld;
        }
        await route.continue();
    });

    await attach(page, { mimeType: 'image/png', name: 'orbit.png' });
    await expect(chat(page).locator('.prompt-input img')).toBeVisible();
    await chat(page).getByRole('button', { name: 'Send' }).click();

    const pending = chat(page).locator('[data-slot="pending-chat-message"]');
    await expect(
        pending.getByRole('button', { name: 'Open orbit.png' }).locator('img')
    ).toBeVisible();
    await expect(pending.locator('[data-variant="file"]')).toHaveCount(0);

    releaseUpload();
    await expect(pending).toHaveCount(0);
    const confirmed = chat(page).getByRole('button', { name: 'Open orbit.png' });
    await expect(confirmed).toHaveCount(1);
    await expect(confirmed.locator('img')).toBeVisible();
    await expect(chat(page).getByRole('button', { name: 'Download orbit.png' })).toHaveCount(0);
});

test('a PNG uploaded with no type and no extension is stored and shown as an image', async ({
    page,
}) => {
    await signInAsAppHuman(page);
    await page.goto('/s/attachment-images');
    await openChannel(page, 'all');

    await attach(page, { mimeType: '', name: 'clipboard-paste' });
    await chat(page).getByRole('button', { name: 'Send' }).click();
    await expect(
        chat(page).getByRole('button', { name: 'Open clipboard-paste' }).locator('img')
    ).toBeVisible();

    // After a reload nothing local remains: the image comes from the stored type and bytes.
    await page.reload();
    await openChannel(page, 'all');
    const image = chat(page).getByRole('button', { name: 'Open clipboard-paste' }).locator('img');
    await expect(image).toBeVisible();
    expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(48);
    await expect(chat(page).getByRole('button', { name: 'Download clipboard-paste' })).toHaveCount(
        0
    );
});

test('the image viewer steps through a message’s images and keeps focus at the last one', async ({
    page,
}) => {
    await signInAsAppHuman(page);
    await page.goto('/s/attachment-images');
    await openChannel(page, 'all');

    const chooser = page.waitForEvent('filechooser');
    await chat(page).getByLabel('Add attachments', { exact: true }).click();
    await (await chooser).setFiles([
        { buffer: solidPng(48, 32), mimeType: 'image/png', name: 'step-one.png' },
        { buffer: solidPng(32, 48), mimeType: 'image/png', name: 'step-two.png' },
    ]);
    await chat(page).getByRole('button', { name: 'Send' }).click();
    await chat(page).getByRole('button', { name: 'Open step-one.png' }).last().click();

    const viewer = page.getByRole('dialog');
    const next = viewer.getByRole('button', { name: 'Next image' });
    await expect(viewer.getByRole('button', { name: 'Previous image' })).toHaveAttribute(
        'aria-disabled',
        'true'
    );
    await next.click();
    await expect(viewer).toContainText('step-two.png');
    // At the last image the pressed button stays focused, so Escape still reaches the dialog.
    await expect(next).toHaveAttribute('aria-disabled', 'true');
    await expect(next).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(viewer).toContainText('step-one.png');
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);
});

/** The open #all chat; a kept, hidden chat view can hold a second composer. */
function chat(page: import('@playwright/test').Page) {
    return page.getByRole('region', { name: 'all' });
}

async function attach(
    page: import('@playwright/test').Page,
    file: { mimeType: string; name: string }
) {
    const chooser = page.waitForEvent('filechooser');
    await chat(page).getByLabel('Add attachments', { exact: true }).click();
    await (await chooser).setFiles({ buffer: solidPng(48, 32), ...file });
}

/** A real, decodable PNG of one color, so the browser lays it out at its natural size. */
function solidPng(width: number, height: number) {
    const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x5a)]);
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header.set([8, 2, 0, 0, 0], 8);
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', header),
        chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

function chunk(type: string, data: Buffer) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
}

function crc32(bytes: Buffer) {
    let crc = 0xff_ff_ff_ff;
    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = crc & 1 ? (crc >>> 1) ^ 0xed_b8_83_20 : crc >>> 1;
        }
    }
    return (crc ^ 0xff_ff_ff_ff) >>> 0;
}
