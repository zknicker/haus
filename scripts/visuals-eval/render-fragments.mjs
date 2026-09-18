// Renders every copy-ready fragment the visuals skill ships, through the real
// product frame, in both schemes — so the house style is something someone has
// actually looked at rather than markup that only reads well.
//
// The fragments are the highest-leverage text in the skill: a model copies one
// far more faithfully than it follows a rule, so a fragment that renders wrong
// is a defect shipped five ways at once.
//
//     bun run eval:fragments
//
// Exits non-zero when a fragment logs a console error or collapses under 60px.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVisualRenderer } from './render.mjs';
import { readSkillFragments } from './skill-fragments.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const minHeight = 60;
const width = Number(process.env.WIDTH ?? 736);

const stamp = new Date().toISOString().replaceAll(/[:T]/gu, '-').slice(0, 19);
const outDir = path.join(here, 'output/fragments', stamp);
await mkdir(outDir, { recursive: true });

const fragments = readSkillFragments().filter((fragment) => fragment.kind === 'visual');
const renderer = await createVisualRenderer({ width });
const results = [];

try {
    for (const fragment of fragments) {
        const { errors, files, heights } = await renderer.render({
            html: fragment.html,
            outDir,
            // A map fetches its own topology, so its real height only arrives
            // after the network settles.
            ready: fragment.html.includes('fetch(') ? 'network' : 'paint',
            slug: fragment.slug,
        });
        const short = Object.entries(heights)
            .filter(([, height]) => height < minHeight)
            .map(([scheme, height]) => `${scheme}: ${Math.round(height)}px tall`);
        results.push({ ...fragment, errors: [...errors, ...short], files, heights });
        const flag = errors.length + short.length > 0 ? '✗' : '·';
        process.stdout.write(
            `${flag} ${fragment.module} — ${fragment.name} (${Object.values(heights)
                .map((height) => Math.round(height))
                .join('/')}px)\n`
        );
        for (const error of [...errors, ...short]) {
            process.stdout.write(`    ${error}\n`);
        }
    }
} finally {
    await renderer.close();
}

await writeFile(path.join(outDir, 'index.html'), contactSheet(results), 'utf8');
process.stdout.write(`\n${results.length} fragments → ${outDir}/index.html\n`);

const failed = results.filter((result) => result.errors.length > 0);
if (failed.length > 0) {
    process.stdout.write(
        `${failed.length} with findings: ${failed.map((r) => r.slug).join(', ')}\n`
    );
    process.exit(1);
}

/** One scrollable page of every fragment, light beside dark, grouped by module. */
function contactSheet(rendered) {
    const safe = (text) =>
        text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const modules = [...new Set(rendered.map((result) => result.module))];
    const body = modules
        .map((module) => {
            const rows = rendered
                .filter((result) => result.module === module)
                .map(
                    (result) => `<figure${result.errors.length > 0 ? ' class="bad"' : ''}>
  <figcaption>${safe(result.name)}${
      result.errors.length > 0 ? ` — <b>${safe(result.errors.join('; '))}</b>` : ''
  }</figcaption>
  <div class="pair">
    <img alt="${safe(result.name)}, light" src="${result.files.light}">
    <img alt="${safe(result.name)}, dark" src="${result.files.dark}">
  </div>
</figure>`
                )
                .join('\n');
            return `<section><h2>${safe(module)}</h2>\n${rows}\n</section>`;
        })
        .join('\n');

    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Visuals skill fragments — ${stamp}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 24px; background: #f6f6f5; color: #1b1a18;
    font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; }
  h1 { font-size: 17px; font-weight: 600; margin: 0 0 4px; }
  h2 { font-size: 13px; font-weight: 600; margin: 32px 0 8px; color: #74716b;
    text-transform: uppercase; letter-spacing: 0.06em; }
  figure { margin: 0 0 16px; }
  figcaption { font-size: 13px; margin-bottom: 6px; }
  figure.bad figcaption { color: #a8402f; }
  .pair { display: flex; gap: 12px; align-items: flex-start; }
  .pair img { width: calc(50% - 6px); border-radius: 8px; border: 1px solid #e3e2df; }
  .pair img:last-child { background: #060607; }
  p.meta { color: #74716b; margin: 0 0 8px; }
</style></head>
<body>
<h1>Visuals skill fragments</h1>
<p class="meta">${rendered.length} fragments · ${width}px · light beside dark · ${stamp}</p>
${body}
</body></html>
`;
}
