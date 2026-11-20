import type { Page } from '@playwright/test';
import {
    installDesktopBrowserStub,
    moveTabToRightPane,
    openDesktopWindow,
} from '../support/desktop-browser-stub.ts';
import { createTestServer, openChannel } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

/**
 * The window-drag contract (desktop-window-layout.md → Window drag): the
 * window band is the one `drag` region, and only its controls are `no-drag`,
 * each on itself. Electron subtracts every `no-drag` box from the drag area,
 * so a no-drag wrapper around controls, or an inner drag box, breaks dragging
 * from empty title-bar space even while the band itself reads `drag`.
 */
test('the window band drags from every empty spot and only its controls opt out', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installDesktopBrowserStub(page);
    const { server } = await createTestServer(page, {
        displayName: 'Window drag',
        slug: 'window-drag-regions',
    });
    await openDesktopWindow(page, `/s/${server.slug}`);
    await openChannel(page, 'all');
    // The region rules are scoped to the macOS desktop root class; set it on any host OS.
    await page.evaluate(() => document.documentElement.classList.add('macos-electron'));
    await expect(page.locator('.shell-window-band')).toBeVisible();

    await expectDragContract(page, 'one pane');

    await page.getByRole('row', { exact: true, name: 'Tasks' }).click({ modifiers: ['Meta'] });
    await moveTabToRightPane(page, 'Tasks');
    await expectDragContract(page, 'two panes');
});

async function expectDragContract(page: Page, layout: string) {
    const report = await page.evaluate(readBandRegions);
    expect(report.dragBoxes, `${layout}: one drag region, the band`).toEqual(['shell-window-band']);
    expect(report.noDragNonControls, `${layout}: no-drag only on controls`).toEqual([]);
    expect(report.controlsNotNoDrag, `${layout}: every control is no-drag`).toEqual([]);
    expect(report.emptyPoints, `${layout}: sampled empty points`).toBeGreaterThan(100);
    expect(report.emptyPointsNotDrag, `${layout}: empty points drag`).toEqual([]);
}

/** Runs in the page: Electron's region math over the band, plus a point sweep. */
function readBandRegions() {
    const control =
        'button, a[href], input, textarea, select, summary, [role="button"], [role="tab"], .workspace-tab, [contenteditable="true"], [contenteditable="plaintext-only"], [data-slot="input-control"], [data-slot="textarea-control"]';
    const band = document.querySelector('.shell-window-band');
    if (!band) {
        throw new Error('No window band.');
    }
    const bandBox = band.getBoundingClientRect();
    const region = (element: Element) =>
        getComputedStyle(element).getPropertyValue('-webkit-app-region').trim() ||
        getComputedStyle(element).getPropertyValue('app-region').trim();
    const name = (element: Element) =>
        `${element.tagName.toLowerCase()}.${String(element.getAttribute('class') ?? '')
            .split(/\s+/u)
            .slice(0, 2)
            .join('.')}`;
    const inBand = (box: DOMRect) =>
        box.width > 0 &&
        box.height > 0 &&
        box.bottom > bandBox.top &&
        box.top < bandBox.bottom &&
        box.right > bandBox.left &&
        box.left < bandBox.right;

    const dragBoxes: string[] = [];
    const noDragNonControls: string[] = [];
    const controlsNotNoDrag: string[] = [];
    const noDragBoxes: DOMRect[] = [];
    for (const element of document.querySelectorAll('*')) {
        const box = element.getBoundingClientRect();
        // Blink collects no region from a hidden box (the mounted, hidden activation frame).
        if (!inBand(box) || getComputedStyle(element).visibility !== 'visible') {
            continue;
        }
        const value = region(element);
        if (value === 'drag') {
            dragBoxes.push(element === band ? 'shell-window-band' : name(element));
        } else if (value === 'no-drag') {
            noDragBoxes.push(box);
            if (!element.matches(control)) {
                noDragNonControls.push(name(element));
            }
        }
        if (band.contains(element) && element.matches(control) && value !== 'no-drag') {
            controlsNotNoDrag.push(name(element));
        }
    }

    // Every point whose hit stack holds no control must sit in drag space.
    let emptyPoints = 0;
    const emptyPointsNotDrag: string[] = [];
    for (let y = bandBox.top + 2; y < bandBox.bottom - 1; y += 6) {
        for (let x = bandBox.left + 2; x < bandBox.right - 1; x += 8) {
            const stack = document.elementsFromPoint(x, y);
            const inside = (box: DOMRect) =>
                x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
            // A control, or a rounded control's corner (hit-testing skips it; its no-drag box does not).
            if (
                stack.some((element) => element.matches(control)) ||
                noDragBoxes.some((box) => inside(box))
            ) {
                continue;
            }
            emptyPoints += 1;
            const firstRegion = stack.find((element) => {
                const value = region(element);
                return value === 'drag' || value === 'no-drag';
            });
            if (firstRegion !== band || region(band) !== 'drag') {
                emptyPointsNotDrag.push(
                    `${Math.round(x)},${Math.round(y)} ${stack.slice(0, 4).map(name).join(' > ')}`
                );
            }
        }
    }
    return { controlsNotNoDrag, dragBoxes, emptyPoints, emptyPointsNotDrag, noDragNonControls };
}
