// Standalone visuals eval: one agent turn per prompt, rendered through the
// real visual frame.
//
// Unlike `eval:design` this runs NO Haus stack — no server, no website, no
// MCP. It builds the same temp agent root the Computer executor builds (the
// seeded visuals skill, the runtime-native skill links, the auth-profile
// symlinks) and hands the sales data to the model inline, then captures
// whatever ```visual fence comes back. What it measures is therefore the skill
// text and the model, with the product's plumbing held constant.
//
// Two lanes answer the same turn shape. `--runner harness` is the product's own
// bridge and stays the default; `--runner direct` spawns the CLI installed on
// this machine, for model ids a pinned bridge rejects.
//
// Usage: bun run eval:visuals --model <runtime>/<model> [--reasoning <effort>]
//        [--runner harness|direct] [--only <slug>] [--width 736]
//        [--skill-dir <dir>] [--out-dir <dir>]
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ensureNativeSkillLinks } from '../../apps/computer/src/harness/native-skill-links.ts';
import { readAgentSkills } from '../../apps/computer/src/harness/skills.ts';
import { seedFactoryManagedSkills } from '../../packages/agent-workspace/src/index.ts';
import {
    splitVisualFences,
    visualFallbackText,
} from '../../packages/haus-api/src/widgets/visual/contracts.ts';
import { writeContactSheet } from '../design-battery/contact-sheet.mjs';
import { createDirectRunner } from './direct-runner.mjs';
import { createHarnessRunner } from './harness-runner.mjs';
import { createVisualRenderer } from './render.mjs';
import { assert, resolveRunConfig } from './run-config.mjs';
import { createRunManifest, manifestTokens } from './run-manifest.mjs';
import { overrideVisualsSkill } from './skill-override.mjs';

const turnTimeoutMs = 900_000;

const {
    executable,
    items,
    modelId,
    outDir,
    reasoningEffort,
    runLabel,
    runnerId,
    runtimeId,
    skillDir,
    stamp,
    width,
} = resolveRunConfig();
await mkdir(outDir, { recursive: true });

const agentRoot = await realpath(await mkdtemp(path.join(tmpdir(), 'haus-visuals-eval-')));
const homeDir = path.join(agentRoot, 'home');
const skillsDir = path.join(agentRoot, 'skills');
const workspaceDir = path.join(agentRoot, 'workspace');
for (const dir of [homeDir, path.join(agentRoot, 'runtime'), skillsDir, workspaceDir]) {
    await mkdir(dir, { recursive: true });
}
await seedFactoryManagedSkills(skillsDir);
const skillOverrides = skillDir ? await overrideVisualsSkill(skillsDir, skillDir) : [];
assert(
    !skillDir || skillOverrides.length > 0,
    `--skill-dir ${skillDir} carries none of SKILL.md, design-system.md, icons.md`
);
await ensureNativeSkillLinks(homeDir, skillsDir);
const skills = await readAgentSkills(skillsDir);
assert(skills.length > 0, `no skills seeded into ${skillsDir}`);

const lane = { executable, homeDir, modelId, reasoningEffort, runtimeId, skills, workspaceDir };
const runner = runnerId === 'direct' ? await createDirectRunner(lane) : createHarnessRunner(lane);

process.stdout.write(
    `visuals eval: ${runLabel} · ${runnerId} runner · ${items.length} prompt(s) · skills ${skills.map((skill) => skill.name).join(', ')}\n`
);
process.stdout.write(
    skillDir
        ? `skill variant: ${skillDir} (${skillOverrides.join(', ')})\n`
        : 'skill variant: seeded default\n'
);

const manifest = await createRunManifest({
    items,
    meta: {
        modelId,
        reasoningEffort,
        runner: runnerId,
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

        for (const [index, visual] of visuals.entries()) {
            const slug = index === 0 ? item.slug : `${item.slug}-${index + 1}`;
            await writeFile(path.join(outDir, `${slug}.visual.html`), visual.html);
            const { files } = await renderer.render({ html: visual.html, outDir, slug });
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
                    visual: `${slug}.visual.html`,
                });
            }
        }
        await manifest.record(item.slug, { ...entry, status: 'ok' });
    }
} finally {
    await renderer.close();
    await rm(agentRoot, { force: true, recursive: true });
    await runner.dispose();
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
 * The trace file, one JSON object per line. A lane that spawns a CLI keeps its
 * stderr as a final record: a refused flag or an expired login shows up nowhere
 * else, and a turn that produced no visual is usually explained there.
 */
function traceLines(turn) {
    const lines = turn.trace.map((entry) => `${JSON.stringify(entry)}\n`);
    if (turn.stderr.trim()) {
        lines.push(`${JSON.stringify({ at: new Date().toISOString(), stderr: turn.stderr })}\n`);
    }
    return lines.join('');
}

function sheetItem(item) {
    return { kind: item.kind, prompt: item.ask, slug: item.slug };
}
