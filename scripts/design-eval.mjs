// Design battery dev tool (PRD-86). Drives the fixed battery of visual
// prompts through a RUNNING dev stack (bun run dev) as real model
// turns, screenshots each rendered result in dark and light themes, and
// writes a contact sheet for human critique against
// scripts/design-battery/RUBRIC.md.
//
// This is a dev tool, not CI: each run costs real model turns, and the
// verdict on the output is the operator's.
//
// Usage: bun run eval:design [--model <runtime>/<model>] [--reasoning <effort>]
//        [--only <slug>] [--server URL] [--website URL] [--keep-model]
//
// --model sets the battery agent's runtime and model for the run (e.g.
// claude-code/claude-sonnet-5, codex/gpt-5.6-sol) and restores the previous
// configuration afterwards unless --keep-model is passed. --reasoning sets the
// agent's reasoning effort (low, medium, high) for the run the same way.
// Captures run against the dev stack's own website, which auto-signs-in as the
// dev human. The battery chat is left in place for transcript inspection.
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { designBattery } from './design-battery/battery.mjs';
import { writeContactSheet } from './design-battery/contact-sheet.mjs';
import { resolveDevPorts } from './dev-ports.mjs';
import { assert, createEvalHarness, sleep } from './eval-harness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const websiteRequire = createRequire(path.join(here, '../apps/website/package.json'));
const { chromium } = websiteRequire('@playwright/test');

const harness = await createEvalHarness({ evalName: 'designeval' });
const {
    authoredBy,
    cleanup,
    pollMessages,
    readHead,
    requireAgents,
    send,
    serverId,
    serverSlug,
    stamp,
    trpc,
    waitForAgentQuiet,
} = harness;

const modelFlag = flagValue('--model');
const reasoningFlag = flagValue('--reasoning');
const onlyFilter = flagValue('--only');
const keepModel = process.argv.includes('--keep-model');

const items = designBattery.filter((item) => !onlyFilter || item.slug.includes(onlyFilter));
assert(items.length > 0, `--only ${onlyFilter} matched no battery items`);

const [agent] = await requireAgents(1);
const original = {
    modelId: agent.desiredModelId,
    reasoningEffort: agent.desiredReasoningEffort,
    runtimeId: agent.desiredRuntimeId,
};
assert(original.modelId && original.runtimeId, `agent ${agent.id} has no configured model`);

const runConfig = { ...original, ...parseModelFlag(modelFlag) };
if (reasoningFlag) {
    assert(
        ['high', 'low', 'medium'].includes(reasoningFlag),
        `--reasoning expects low, medium or high; received ${reasoningFlag}`
    );
    runConfig.reasoningEffort = reasoningFlag;
}
const reconfigured = modelFlag !== null || reasoningFlag !== null;
if (reconfigured) {
    await assertModelAvailable(runConfig);
    process.stdout.write(
        `configuring ${agent.name}: ${describeConfig(original)} -> ${describeConfig(runConfig)}\n`
    );
    await trpc('agent.configure', { agentId: agent.id, serverId, ...runConfig });
    await trpc('agent.reset', { agentId: agent.id, kind: 'session', serverId });
}

const runLabel = describeConfig(runConfig);
const outDir = path.join(
    here,
    'design-battery/output',
    `${stamp}-${runLabel.replaceAll(/[^a-zA-Z0-9.-]+/gu, '-')}`
);
await mkdir(outDir, { recursive: true });

const chat = await trpc('chat.createChannel', {
    agentIds: [agent.id],
    name: `design-battery-${stamp}`,
    serverId,
});
const chatId = chat.id;
process.stdout.write(`battery chat: ${chatId} (${items.length} items, model ${runLabel})\n`);

const chatUrl = `${resolveWebsiteUrl()}/s/${serverSlug}/chats/${encodeURIComponent(chatId)}`;
const browser = await chromium.launch();
const page = await browser.newPage({
    deviceScaleFactor: 2,
    viewport: { height: 1000, width: 1440 },
});
const captures = [];
const failures = [];

try {
    for (const item of items) {
        const startedAt = Date.now();
        process.stdout.write(`\n▶ ${item.slug}\n`);
        try {
            await generateItem(item);
            const files = await captureItem(item);
            captures.push({ files, item, seconds: Math.round((Date.now() - startedAt) / 1000) });
            process.stdout.write(`  ✓ captured (${captures.at(-1).seconds}s)\n`);
        } catch (error) {
            failures.push({ error: String(error), slug: item.slug });
            process.stdout.write(`  ✗ ${item.slug}: ${String(error).slice(0, 300)}\n`);
        }
    }
} finally {
    await browser.close();
    if (reconfigured && !keepModel) {
        await trpc('agent.configure', { agentId: agent.id, serverId, ...original }).catch((error) =>
            process.stdout.write(`config restore failed: ${error}\n`)
        );
    }
}

const sheetPath = await writeContactSheet({ captures, chatId, outDir, runLabel, stamp });
process.stdout.write(`\n${captures.length}/${items.length} items captured\n`);
for (const failure of failures) {
    process.stdout.write(`failed: ${failure.slug} — ${failure.error.slice(0, 200)}\n`);
}
process.stdout.write(`output: ${path.relative(process.cwd(), sheetPath)}\n`);
process.stdout.write(`chat kept for inspection: ${chatId}\n`);
await cleanup();
process.exit(failures.length > 0 ? 1 : 0);

// A single failed turn ("failed to produce a reply", transient provider
// errors) gets one retry so a long battery run survives model flakiness.
async function generateItem(item) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
        const head = await readHead(chatId);
        await send(chatId, item.prompt);
        try {
            // A cold session can take minutes to accept the turn, and a
            // model that opens with a preamble finishes the visual long after
            // its first row lands — so wait for the reply, then for the turn
            // itself to settle. The runtime's own watchdog is the real cap on
            // both, so wait generously.
            await pollMessages(
                chatId,
                (messages) => authoredBy(messages, agent.id, head).length > 0,
                1_800_000
            );
            await waitForAgentQuiet(agent.id, 8000, 1_800_000);
            return;
        } catch (error) {
            if (attempt === 2) {
                throw error;
            }
            process.stdout.write(`  ↻ retrying: ${String(error).slice(0, 160)}\n`);
            await sleep(3000);
        }
    }
}

async function captureItem(item) {
    await page.goto(chatUrl, { waitUntil: 'domcontentloaded' });
    await sleep(6000);
    await expandCollapsedVisual();
    if (item.kind === 'artifact') {
        await openLatestArtifact();
    }

    const files = {};
    for (const theme of ['dark', 'light']) {
        await applyTheme(theme);
        await sleep(1200);
        const file = `${item.slug}-${theme}.png`;
        await screenshotLatest(item, path.join(outDir, file));
        files[theme] = file;
    }
    await applyTheme('dark');
    return files;
}

// The App's ThemeProvider owns these three; setting them directly flips the
// theme without a reload, and visual cards re-theme off the data-theme change.
async function applyTheme(theme) {
    await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
        document.documentElement.style.colorScheme = value;
        document.documentElement.classList.toggle('dark', value === 'dark');
    }, theme);
}

// Visuals taller than the collapse threshold render with a fade and a
// "Show all" toggle; expand so the screenshot shows the full output.
async function expandCollapsedVisual() {
    const toggle = page.getByRole('button', { exact: true, name: 'Show all' }).last();
    if (await toggle.isVisible().catch(() => false)) {
        await toggle.click();
        await sleep(600);
    }
}

async function openLatestArtifact() {
    const card = page.getByRole('button').filter({ hasText: '.html' }).last();
    if (await card.isVisible().catch(() => false)) {
        await card.click();
        await sleep(2500);
    } else {
        process.stdout.write('  ! no page card found; capturing transcript instead\n');
    }
}

async function screenshotLatest(item, filePath) {
    if (item.kind === 'artifact') {
        await page.screenshot({ path: filePath });
        return;
    }
    const card = page.locator('div.card-shell', { has: page.locator('iframe') }).last();
    if (await card.isVisible().catch(() => false)) {
        await card.screenshot({ path: filePath });
        return;
    }
    // Non-iframe result (e.g. the model chose a catalog widget): capture the
    // transcript viewport so the miss is still reviewable.
    await page.screenshot({ path: filePath });
}

function parseModelFlag(value) {
    if (!value) {
        return {};
    }
    const separator = value.indexOf('/');
    assert(separator > 0, `--model expects <runtime>/<model>; received ${value}`);
    return {
        modelId: value.slice(separator + 1),
        runtimeId: value.slice(0, separator),
    };
}

async function assertModelAvailable({ modelId, runtimeId }) {
    const computers = await trpc('computer.list', { serverId });
    const runtimes = computers.flatMap((computer) => computer.reportedInventory?.runtimes ?? []);
    const runtime = runtimes.find((candidate) => candidate.id === runtimeId);
    assert(
        runtime,
        `no reported runtime ${runtimeId}; available: ${runtimes.map((entry) => entry.id).join(', ')}`
    );
    assert(
        runtime.models.some((model) => model.id === modelId),
        `runtime ${runtimeId} has no model ${modelId}; available: ${runtime.models.map((model) => model.id).join(', ')}`
    );
}

function describeConfig(config) {
    return `${config.runtimeId}/${config.modelId}-${config.reasoningEffort}`;
}

function resolveWebsiteUrl() {
    const explicit = flagValue('--website');
    if (explicit) {
        return explicit.replace(/\/$/u, '');
    }
    return `http://localhost:${resolveDevPorts().websitePort}`;
}

function flagValue(name) {
    const index = process.argv.indexOf(name);
    return index !== -1 ? (process.argv[index + 1] ?? null) : null;
}
