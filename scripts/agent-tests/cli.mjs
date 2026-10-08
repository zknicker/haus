// bun run test:agents — headless agent-behavior tests against the running dev
// stack. No browser, no Playwright: scenarios drive the same hosted tRPC and
// Agent API contracts the App uses.
//
//   bun scripts/agent-tests/cli.mjs [--only <substring>] [--list] [--json]
//                                   [--include-opt-in] [--lanes <n>]

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createEvalHarness } from '../eval-harness.mjs';
import { settleEvalCleanup } from './cleanup-chats.mjs';
import { createAgentTestKit } from './kit.mjs';
import { createRenderer, formatWall } from './render.mjs';
import {
    buildSummary,
    buildTranscript,
    captureAgentDiagnostics,
    createReportWriter,
    runStamp,
} from './report.mjs';
import { createExpect, isScenario } from './scenario.mjs';
import { describeSweep, sweepAgentTestLeftovers } from './sweep.mjs';
import { collectScenarioMessages, expectAgentVoice } from './voice-gate.mjs';

/**
 * Agents are per scenario, so machine + provider throughput caps the lanes:
 * measured on a dev Mac, 3 lanes (≈6-10 concurrent codex sessions) holds
 * ~90% pass; 8 lanes wedges turns en masse. Override with --lanes.
 */
const defaultLaneCeiling = 3;

const scenariosDirectory = fileURLToPath(new URL('./scenarios/', import.meta.url));
const repositoryRoot = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));

const options = parseArgv(process.argv.slice(2));
const scenarios = filterScenarios(await loadScenarios(), options.only, options.includeOptIn);

if (options.list) {
    const listed = scenarios.map((scenario) => ({
        contract: scenario.contract,
        name: scenario.name,
    }));
    process.stdout.write(
        options.json
            ? `${JSON.stringify(listed, null, 4)}\n`
            : `${listed.map((scenario) => `  ${scenario.name}`).join('\n')}\n`
    );
    process.exit(0);
}

// An empty scenario set is a failure, not a clean run — and it is decided
// before anything reaches the dev stack, so a typo costs no live agent time.
if (scenarios.length === 0) {
    process.stderr.write(
        options.only.length > 0
            ? `No agent-test scenario name contains ${JSON.stringify(options.only)}.\n  list them with: bun run test:agents --list\n`
            : `No agent-test scenarios found in ${scenariosDirectory}.\n`
    );
    process.exit(1);
}

const stamp = runStamp();
const report = createReportWriter({ repositoryRoot, stamp });
const renderer = createRenderer({ quiet: options.json });
const startedAt = new Date().toISOString();
const startedAtMs = Date.now();

const results = await runScenarios().catch(reportInfraFailure);
const wallSeconds = Math.round((Date.now() - startedAtMs) / 1000);
const summary = buildSummary({ scenarios: results, startedAt, wallSeconds });
await report.writeSummary(summary);
renderer.stop();

const passed = results.filter((result) => result.ok).length;
if (options.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 4)}\n`);
} else {
    renderer.summary(
        results,
        `${passed}/${results.length} passed · ${formatWall(wallSeconds)} · report ${report.relativeDirectory}`
    );
}
exit(passed === results.length ? 0 : 1);

async function runScenarios() {
    const harness = await createEvalHarness({ evalName: 'agent-tests', repositoryRoot });
    const collected = [];
    const retirements = [];
    try {
        const swept = describeSweep(await sweepAgentTestLeftovers(harness, { repositoryRoot }));
        if (swept) {
            process.stderr.write(`${swept}\n`);
        }
        const queue = scenarios.map((scenario, index) => ({ index: index + 1, scenario }));
        const lanes = options.lanes ?? Math.min(defaultLaneCeiling, Math.max(queue.length, 1));
        await Promise.all(
            Array.from({ length: lanes }, async () => {
                for (;;) {
                    const next = queue.shift();
                    if (!next) {
                        return;
                    }
                    collected.push(await runScenario(harness, next, retirements));
                }
            })
        );
    } finally {
        // Retirement is bounded inside itself and never gates a lane; the run
        // still waits for it here so the ledger is settled before exit.
        await Promise.all(retirements);
        await harness.cleanup();
    }
    return scenarios
        .map((scenario) => collected.find((result) => result.name === scenario.name))
        .filter(Boolean);
}

async function runScenario(harness, { index, scenario }, retirements) {
    const key = scenario.name;
    const startedAtScenario = Date.now();
    renderer.start(key, { index, name: scenario.name });
    const assertions = [];
    const kit = createAgentTestKit(harness, { repositoryRoot, scenarioName: scenario.name });
    const expect = createExpect(assertions);
    let agents = [];
    let error = null;

    try {
        renderer.phase(key, 'provisioning');
        agents = await kit.provision(scenario.agents, {
            onPhase: (phase) => renderer.phase(key, phase),
        });
        renderer.phase(key, 'running');
        await scenario.run({
            agents,
            expect,
            kit,
            log: (phase) => renderer.phase(key, phase),
            marker: kit.marker,
            settleTurn: (agentId, settleOptions = {}) =>
                kit.settleTurn(agentId, {
                    onPhase: (phase) => renderer.phase(key, phase),
                    ...settleOptions,
                }),
        });
        // Shared gate over every model-authored message the scenario produced.
        expectAgentVoice(expect, await collectScenarioMessages(kit));
    } catch (cause) {
        error = cause;
    }

    // The verdict clock stops here: teardown is not scenario time. Cleanup is
    // bounded — a chat delete stalled behind a still-active turn defers its
    // ids to the next run via the crash ledger instead of stretching this one;
    // the ledger only forgets ids the delete confirmed.
    const seconds = Math.round((Date.now() - startedAtScenario) / 1000);
    const diagnostics = error ? await captureAgentDiagnostics(kit, agents) : [];
    const result = {
        agents: agents.map((agent) => agent.handle),
        assertions,
        error,
        name: scenario.name,
        ok: !error,
        seconds,
    };
    await report.writeScenario(
        scenario.name,
        buildTranscript({ diagnostics, error, kit, result, scenario })
    );
    const cleanedUp = await settleEvalCleanup(
        kit.cleanup().catch((cause) => {
            process.stderr.write(`\ncleanup deferred for ${key}: ${String(cause).slice(0, 200)}\n`);
        })
    );
    if (!cleanedUp) {
        process.stderr.write(`\ncleanup for ${key} exceeded 60s; deferring to the next run.\n`);
    }
    // Retirement is started, not awaited: this lane takes the next scenario
    // while these Agents are deleted, and the run awaits them at the end.
    retirements.push(retire(kit, key));

    renderer.finish(key, { error, ok: result.ok, seconds });
    return result;
}

/** Retiring never fails a settled verdict; unconfirmed deletes are swept next run. */
async function retire(kit, key) {
    const { failures } = await kit.retire().catch((cause) => ({ failures: [{ error: cause }] }));
    if (failures.length > 0) {
        process.stderr.write(
            `\nretiring ${failures.length} Agent(s) for ${key} deferred to the next run: ${String(failures[0].error).slice(0, 200)}\n`
        );
    }
}

/** Setup failures are the whole run failing, not one scenario failing. */
function reportInfraFailure(error) {
    renderer.stop();
    process.stderr.write(
        `\nThe agent tests could not reach the dev stack: ${error}\nStart it with bun run dev, then rerun.\n`
    );
    return [{ assertions: [], error, name: 'agent-tests setup', ok: false, seconds: 0 }];
}

async function loadScenarios() {
    const entries = await readdir(scenariosDirectory).catch(() => []);
    const loaded = [];
    for (const entry of entries.filter((file) => file.endsWith('.mjs')).sort()) {
        const module = await import(pathToFileURL(path.join(scenariosDirectory, entry)).href);
        const scenario = module.default;
        if (!isScenario(scenario)) {
            throw new Error(`${entry} must default-export defineScenario(...).`);
        }
        loaded.push(scenario);
    }
    return loaded;
}

function filterScenarios(loaded, only, includeOptIn) {
    const eligible = loaded.filter((scenario) => includeOptIn || !scenario.optIn);
    return only.length > 0
        ? eligible.filter((scenario) => only.some((filter) => scenario.name.includes(filter)))
        : eligible;
}

/** Unknown args abort: a typo must never quietly become a full live-agent run. */
function parseArgv(argv) {
    const parsed = { includeOptIn: false, json: false, lanes: null, list: false, only: [] };
    const rest = [...argv];
    while (rest.length > 0) {
        const arg = rest.shift();
        if (arg === '--json' || arg === '--list') {
            parsed[arg.slice(2)] = true;
        } else if (arg === '--include-opt-in') {
            parsed.includeOptIn = true;
        } else if (arg === '--only') {
            const filter = rest.shift();
            if (!filter || filter.startsWith('--')) {
                process.stderr.write('--only needs a scenario-name substring.\n');
                process.exit(2);
            }
            parsed.only.push(filter);
        } else if (arg === '--lanes') {
            // Lanes are not clamped: Agents are created per scenario, so the
            // only real ceiling is what the provider and Computer will take.
            const requested = rest.shift();
            const lanes = Math.trunc(Number(requested));
            if (!(Number.isFinite(lanes) && lanes >= 1)) {
                process.stderr.write(`--lanes needs a whole number of lanes, got ${requested}.\n`);
                process.exit(2);
            }
            parsed.lanes = lanes;
            process.stderr.write(`Running ${lanes} lanes.\n`);
        } else {
            process.stderr.write(
                `Unknown argument ${arg}.\n` +
                    '  usage: bun run test:agents [--only <substring>] [--list] [--json] [--include-opt-in] [--lanes <n>]\n'
            );
            process.exit(2);
        }
    }
    return parsed;
}

/** Clerk's headless client keeps refresh timers alive after the run finishes. */
function exit(code) {
    process.exitCode = code;
    setTimeout(() => process.exit(code), 0);
}
