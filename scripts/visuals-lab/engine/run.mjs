// One agent turn per battery prompt, rendered through the real visual frame.
//
// This is the visuals lab's engine: `scripts/visuals-lab/server.mjs` spawns it.
// It has no package script and is not meant to be driven by hand, because every
// run is a real model turn on a real Model connection and costs real money.
//
// Unlike `eval:design` it drives no Agent through the Server: no chat, no
// inbox, no haus CLI. It runs the Agent runner's own harness in process on a
// Model connection the dev Server holds, so the dev stack must be up (see
// lab-connection.mjs). The lab machine is a temp Computer agents root with the
// seeded visuals skill in the Agent's Drive folder; the sales data rides the
// prompt inline, and whatever ```visual fence comes back is captured. What it
// measures is therefore the skill text and the model, with the product's
// plumbing held constant.
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { skillEntry } from '../../../apps/runner/src/turn/agent-drive.ts';
import { seedFactoryManagedSkills } from '../../../packages/agent-workspace/src/index.ts';
import {
    splitVisualFences,
    visualFallbackText,
} from '../../../packages/haus-api/src/widgets/visual/contracts.ts';
import { writeContactSheet } from '../../design-battery/contact-sheet.mjs';
import { fenceFilesFor, findingsFileFor } from './findings.mjs';
import { createHarnessRunner } from './harness-runner.mjs';
import { labInstructions } from './instructions.mjs';
import { createVisualRenderer } from './render.mjs';
import { assert, resolveRunConfig } from './run-config.mjs';
import { createRunManifest, manifestTokens } from './run-manifest.mjs';
import { overrideVisualsSkill } from './skill-override.mjs';

const turnTimeoutMs = 900_000;
const agentId = 'agt_visuals_lab';
const skillsPath = 'drive/agents/lab/skills';
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const { items, modelId, outDir, reasoningEffort, runLabel, runtimeId, skillDir, stamp, width } =
    resolveRunConfig();
await mkdir(outDir, { recursive: true });

const labRoot = await realpath(await mkdtemp(path.join(tmpdir(), 'haus-visuals-lab-')));
const agentsRoot = path.join(labRoot, 'servers', 'srv_visuals_lab', 'agents');
const skillsDir = path.join(agentsRoot, agentId, 'workspace', ...skillsPath.split('/'));
await mkdir(skillsDir, { recursive: true });
await seedFactoryManagedSkills(skillsDir);
const skillOverrides = skillDir ? await overrideVisualsSkill(skillsDir, skillDir) : [];
const skills = await readSkills(skillsDir);
assert(skills.length > 0, `no skills seeded into ${skillsDir}`);

const runner = await createHarnessRunner({
    agentId,
    agentsRoot,
    ...labInstructions({ skills, skillsPath }),
    modelId,
    reasoningEffort,
    repositoryRoot,
    runnerRoot: path.join(labRoot, 'runner'),
}).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exit(2);
});

process.stdout.write(
    `visuals lab: ${runLabel} · ${runner.harness} on ${runner.connectionLabel} · ${items.length} prompt(s) · skills ${skills.map((skill) => skill.name).join(', ')}\n`
);
process.stdout.write(
    skillDir
        ? `skill revision: ${skillDir} (${skillOverrides.join(', ')})\n`
        : 'skill revision: working tree\n'
);

const manifest = await createRunManifest({
    items,
    meta: {
        modelId,
        reasoningEffort,
        runtimeId,
        skillDir,
        startedAt: new Date().toISOString(),
        width,
    },
    outDir,
});

const renderer = await createVisualRenderer({ width });
const captures = [];
const usageBySlug = {};
const failures = [];

try {
    for (const item of items) {
        process.stdout.write(`\n▶ ${item.slug}\n`);
        const startedAt = Date.now();
        await manifest.start(item.slug);
        let turn;
        try {
            turn = await runner.runTurn({ prompt: item.prompt, timeoutMs: turnTimeoutMs });
        } catch (error) {
            const reason = String(error).slice(0, 300);
            process.stdout.write(`  ✗ turn failed: ${reason}\n`);
            failures.push({ reason, slug: item.slug });
            captures.push({
                files: {},
                item: { ...sheetItem(item), prompt: `${item.ask}\n\n⚠ turn failed: ${reason}` },
            });
            await manifest.record(item.slug, {
                error: reason,
                status: 'error',
                wallMs: Date.now() - startedAt,
            });
            continue;
        }
        const wallMs = Date.now() - startedAt;
        const seconds = Math.round(wallMs / 1000);
        const replyFile = `${item.slug}.reply.md`;
        const traceFile = `${item.slug}.trace.jsonl`;
        await writeFile(path.join(outDir, replyFile), turn.text);
        await writeFile(path.join(outDir, traceFile), traceLines(turn));
        const readDesignSystem = turn.trace.some((entry) =>
            entry.input.includes('design-system.md')
        );
        usageBySlug[item.slug] = {
            costUsd: turn.costUsd,
            readDesignSystem,
            seconds,
            toolCalls: turn.trace.length,
            usage: turn.usage,
            visuals: 0,
        };

        const visuals = splitVisualFences(turn.text).filter(
            (segment) => segment.kind === 'visual' && segment.html.trim().length > 0
        );
        usageBySlug[item.slug].visuals = visuals.length;
        process.stdout.write(
            `  ${visuals.length} visual(s) · ${turn.trace.length} tool calls · design-system.md ${readDesignSystem ? 'read' : 'NOT read'} · ${seconds}s\n`
        );
        const entry = {
            designSystemRead: readDesignSystem,
            fenceCount: visuals.length,
            files: { reply: replyFile, trace: traceFile },
            tokens: manifestTokens(turn.usage),
            wallMs,
        };
        if (visuals.length === 0) {
            failures.push({ reason: 'no visual fence in reply', slug: item.slug });
            captures.push({
                files: {},
                item: { ...sheetItem(item), prompt: `${item.ask}\n\n⚠ no visual fence emitted` },
            });
            await manifest.record(item.slug, { ...entry, status: 'no-fence' });
            continue;
        }

        const quality = { console: [], layout: [] };
        const fenceFiles = fenceFilesFor(item.slug, visuals.length);
        for (const [index, visual] of visuals.entries()) {
            const slug = index === 0 ? item.slug : `${item.slug}-${index + 1}`;
            await writeFile(path.join(outDir, fenceFiles[index]), visual.html);
            const { consoleErrors, files, findings } = await renderer.render({
                html: visual.html,
                outDir,
                slug,
            });
            quality.console.push(...consoleErrors.map((text) => `${slug}: ${text}`));
            quality.layout.push(...findings.map((text) => `${slug}: ${text}`));
            captures.push({
                files,
                item: {
                    ...sheetItem(item),
                    prompt: `${item.ask}\n\n${visualFallbackText(visual)}`,
                    slug,
                },
            });
            if (index === 0) {
                Object.assign(entry.files, {
                    dark: files.dark,
                    light: files.light,
                    visual: fenceFiles[0],
                });
            }
        }
        // The objective read on every column: what the shipped fences do in the
        // real frame.
        const findingsFile = findingsFileFor(item.slug);
        await writeFile(path.join(outDir, findingsFile), `${JSON.stringify(quality, null, 2)}\n`);
        process.stdout.write(
            `  ${quality.layout.length} layout finding(s) · ${quality.console.length} console error(s)\n`
        );
        await manifest.record(item.slug, {
            ...entry,
            consoleErrors: quality.console.length,
            files: { ...entry.files, findings: findingsFile },
            layoutFindings: quality.layout.length,
            status: 'ok',
        });
    }
} finally {
    await renderer.close();
    await runner.dispose();
    await rm(labRoot, { force: true, recursive: true });
}

await manifest.finish();
await writeFile(path.join(outDir, 'usage.json'), `${JSON.stringify(usageBySlug, null, 2)}\n`);
const sheetPath = await writeContactSheet({
    captures,
    chatId: 'offline harness (no chat)',
    outDir,
    runLabel,
    stamp,
});
process.stdout.write(`\noutput: ${path.relative(process.cwd(), sheetPath)}\n`);
for (const failure of failures) {
    process.stdout.write(`failed: ${failure.slug} — ${failure.reason}\n`);
}
process.exit(failures.length > 0 ? 1 : 0);

/**
 * The trace file, one JSON object per line, with any stderr as a final record:
 * a refused flag or an expired login shows up nowhere else, and a turn that
 * produced no visual is usually explained there.
 */
function traceLines(turn) {
    const lines = turn.trace.map((entry) => `${JSON.stringify(entry)}\n`);
    if (turn.stderr.trim()) {
        lines.push(`${JSON.stringify({ at: new Date().toISOString(), stderr: turn.stderr })}\n`);
    }
    return lines.join('');
}

/** The skill listing's entries, read from each seeded `SKILL.md` as the runner reads Drive. */
async function readSkills(dir) {
    const folders = (await readdir(dir, { withFileTypes: true })).filter((entry) =>
        entry.isDirectory()
    );
    const skills = await Promise.all(
        folders.map(async (folder) =>
            skillEntry(folder.name, await readFile(path.join(dir, folder.name, 'SKILL.md'), 'utf8'))
        )
    );
    return skills.toSorted((left, right) => left.name.localeCompare(right.name));
}

function sheetItem(item) {
    return { kind: item.kind, prompt: item.ask, slug: item.slug };
}
