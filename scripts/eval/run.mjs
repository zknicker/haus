// Runs one build of an eval: boots its isolated stack, runs N passes of the
// eval's scenarios serially through the agent-test runner, and stops the stack.
// Never two runners on one stack: passes are strictly sequential.

import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { runsDirectory } from './evidence.mjs';
import {
    failedScenarios,
    heartbeatEvidencePath,
    saveFailureEvidence,
} from './failure-evidence.mjs';
import { isInfraFailure } from './grade.mjs';
import { bootStack, stackEnvironment, stopStack } from './stack.mjs';
import { runnerCause } from './summary.mjs';

const runStampPattern = /^\d{8}T\d{6}$/u;

/**
 * `{ runs: [{ pass, stamp }], infra: [reason], leftovers: [..] }`. A boot
 * failure or a pass that leaves no run report is infra; the build stops there.
 */
export async function runBuild({
    build,
    lanes,
    model,
    outDir,
    passes,
    root,
    scenarios,
    stackId,
    terminal,
}) {
    const result = { infra: [], leftovers: [], runs: [] };
    terminal.step(build, `booting stack ${stackId}`, 'warning');
    const bootStarted = Date.now();
    let stack;
    try {
        stack = await bootStack({
            logFile: path.join(outDir, `stack-${build}.log`),
            root,
            stackId,
        });
    } catch (error) {
        result.infra.push(String(error.message ?? error));
        terminal.step(build, String(error.message ?? error), 'danger');
        return result;
    }
    terminal.step(
        build,
        `stack ready · ${seconds(bootStarted)}s · server :${stack.ports.hausPort}`,
        'ok'
    );
    const stopOnSignal = () => {
        void stopStack(stack).finally(() => process.exit(130));
    };
    process.once('SIGINT', stopOnSignal);
    try {
        for (let pass = 1; pass <= passes; pass += 1) {
            terminal.step(build, `pass ${pass}/${passes}`);
            const outcome = await runPass({
                build,
                lanes,
                model,
                outDir,
                pass,
                root,
                scenarios,
                stackId,
                terminal,
            });
            if (outcome.infra) {
                result.infra.push(`pass ${pass}: ${outcome.infra}`);
                terminal.step(build, `pass ${pass} could not run: ${outcome.infra}`, 'danger');
                break;
            }
            result.runs.push({ pass, stamp: outcome.stamp });
        }
    } finally {
        process.off('SIGINT', stopOnSignal);
        const stopped = await stopStack(stack);
        result.leftovers = stopped.leftovers;
        const clean = stopped.cleanStop && stopped.leftovers.length === 0;
        terminal.step(
            build,
            clean
                ? 'stack stopped · no leftovers'
                : `stack stopped · ${stopped.leftovers.length} leftover(s)${stopped.cleanStop ? '' : ', no clean-stop line'}`,
            clean ? 'muted' : 'warning'
        );
    }
    return result;
}

/** One `cli.mjs` run over every scenario; settles print as they land. */
async function runPass({ build, lanes, model, outDir, pass, root, scenarios, stackId, terminal }) {
    const before = new Set(await listStamps(root));
    const startedAt = Date.now();
    const args = [
        path.join(root, 'scripts/agent-tests/cli.mjs'),
        ...scenarios.flatMap((name) => ['--only', name]),
        '--include-opt-in',
        '--lanes',
        String(lanes),
    ];
    const extra = model ? { HAUS_AGENT_TESTS_MODEL: model.label } : {};
    const log = createWriteStream(path.join(outDir, `pass-${build}-${pass}.log`));
    const child = spawn('bun', args, {
        cwd: root,
        env: stackEnvironment(stackId, extra),
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    const parser = createSettleParser((settled) => {
        if (scenarios.includes(settled.name)) {
            terminal.settled({ ...settled, infra: !settled.ok && isInfraFailure(settled.reason) });
        }
    });
    child.stdout.on('data', (chunk) => {
        log.write(chunk);
        parser.push(String(chunk));
    });
    child.stderr.on('data', (chunk) => log.write(chunk));
    const code = await new Promise((resolve) =>
        child.once('exit', (exitCode) => resolve(exitCode))
    );
    await new Promise((resolve) => log.end(resolve));
    const stamp = (await listStamps(root)).find((entry) => !before.has(entry));
    if (!stamp) {
        return { infra: `the runner exited ${code} without a run report` };
    }
    const summary = JSON.parse(
        await readFile(path.join(root, runsDirectory, stamp, 'summary.json'), 'utf8').catch(
            () => '{}'
        )
    );
    const setup = summary.scenarios?.find((entry) => entry.name === 'agent-tests setup');
    if (!summary.scenarios || setup) {
        return { infra: setup ? runnerCause(setup.error) : 'no summary.json' };
    }
    await saveFailureEvidence({
        evidenceDir: path.join(root, heartbeatEvidencePath),
        failed: failedScenarios(summary),
        outDir,
        prefix: `pass-${build}-${pass}`,
        sinceMs: startedAt,
    });
    return { stamp };
}

/**
 * Parses the runner's non-TTY lines: "▶ 01 name … settled · 12s" (or
 * "failed") followed by "  ✓ pass (12s)" or "  ✗ fail (12s) — reason".
 */
export function createSettleParser(onSettled) {
    let buffer = '';
    let pending = null;
    return {
        push(text) {
            buffer += text;
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
                // Names past the runner's 26-column pad run straight into the phase.
                const settled = line.match(/^▶ \d+ (\S+?)\s*(settled|failed) · (\d+)s$/u);
                if (settled) {
                    pending = { name: settled[1], seconds: Number(settled[3]) };
                    continue;
                }
                const verdict = line.match(/^ {2}([✓✗]) (?:pass|fail) \((\d+)s\)(?: — (.*))?$/u);
                if (verdict && pending) {
                    const ok = verdict[1] === '✓';
                    onSettled({ ...pending, ok, reason: ok ? '' : (verdict[3] ?? '') });
                    pending = null;
                }
            }
        },
    };
}

async function listStamps(root) {
    const entries = await readdir(path.join(root, runsDirectory)).catch(() => []);
    return entries.filter((entry) => runStampPattern.test(entry)).sort();
}

function seconds(startedAt) {
    return Math.round((Date.now() - startedAt) / 1000);
}
