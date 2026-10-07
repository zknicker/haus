import { expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import { detectChromeApplications } from '../browser/chrome-detection.ts';
import { launchHeadlessChrome } from './chrome.ts';
import { renderVisualPreviews } from './render.ts';

/**
 * The one lane against real Chrome: it runs wherever system Google Chrome is
 * installed (a macOS dev machine) and skips elsewhere, such as Linux CI.
 */
const [chrome] = await detectChromeApplications();

// The hidden summary heading is the skill's own sr-only pattern: a 1px clipped
// box whose text spills across the chart. It must not read as clipped or
// overlapping text.
const fence = `<h2 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Revenue is up this week across every marketplace we track</h2>
<svg viewBox="0 0 300 60" width="300" height="60">
  <text x="10" y="30">Revenue label</text>
  <text x="40" y="32">Overlapping label</text>
</svg>
<img src="https://example.com/pixel.png">
<script>console.error('fixture error'); throw new Error('fixture throw');</script>`;

test.skipIf(!chrome)(
    'renders a fence in real headless Chrome with findings, a PNG, and no leftovers',
    async () => {
        const before = leftoverProfiles();
        const [result] = await renderVisualPreviews(
            [{ html: fence, title: 'Live' }],
            { schemes: ['dark'], widths: [375] },
            () => launchHeadlessChrome(chrome?.executablePath ?? '')
        );
        const render = result?.renders[0];

        expect(render?.timedOut).toBe(false);
        expect(render?.reportedHeight).toBeGreaterThan(0);
        expect(render?.height).toBeGreaterThanOrEqual(120);
        // PNG signature.
        expect([...(render?.png ?? []).slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
        expect(render?.consoleErrors).toEqual(['fixture error']);
        expect(render?.exceptions).toEqual(['Error: fixture throw (fence line 7)']);
        expect(render?.cspViolations).toEqual(['img-src blocked https://example.com/pixel.png']);
        expect(render?.findings.map((finding) => finding.kind)).toEqual(['text-overlap']);
        expect(leftoverProfiles()).toEqual(before);
    },
    30_000
);

function leftoverProfiles(): string[] {
    return fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('haus-visual-preview-'));
}
