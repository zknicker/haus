// One isolated dev stack per eval build. `HAUS_DEV_STACK_ID` gives the stack
// its own ports, Postgres, and Computer state under ~/.haus/dev/<id>; the
// agent-test runner resolves the same ports from the same id.

import { execFileSync, spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fakeLinearOrigin } from '../agent-tests/fake-linear.mjs';
import { resolveDevPorts } from '../dev-ports.mjs';

const bootTimeoutMs = 6 * 60_000;
const stopTimeoutMs = 90_000;

/**
 * The environment every eval child runs with: this stack's id, no inherited port overrides,
 * and the heartbeat clock switched off (no schedule loop, no quiet hours), so a run does
 * not depend on the time of day.
 */
export function stackEnvironment(stackId, extra = {}) {
    const env = {
        ...process.env,
        HAUS_HEARTBEAT_QUIET_HOURS: 'off',
        HAUS_HEARTBEAT_SCHEDULE: 'off',
        ...extra,
        HAUS_DEV_STACK_ID: stackId,
    };
    for (const key of ['HAUS_DEV_PORT_BASE', 'HAUS_WEBSITE_PORT', 'HAUS_SERVER_PORT']) {
        delete env[key];
    }
    return env;
}

export function stackPorts(root, stackId) {
    return resolveDevPorts({ baseEnvironment: stackEnvironment(stackId), repositoryRoot: root });
}

/**
 * Boots `scripts/run-dev-stack.mjs web` in `root` and resolves once it prints
 * "Ready to go". Output goes to `logFile`, never the terminal.
 */
export async function bootStack({ logFile, root, stackId }) {
    const ports = stackPorts(root, stackId);
    const busy = listeningPids(ports);
    if (busy.length > 0) {
        throw new Error(
            `Stack ${stackId} already has listeners on ${ports.hausPort}/${ports.websitePort} (pids ${busy.join(', ')}); is another eval running?`
        );
    }
    const log = createWriteStream(logFile, { flags: 'a' });
    // `./scripts`, not `scripts`: peer sessions' cleanup kills `node scripts/run-dev-stack.mjs web`.
    const child = spawn('node', ['./scripts/run-dev-stack.mjs', 'web'], {
        cwd: root,
        // Linear scenarios serve a fake Linear here; nothing reaches api.linear.app.
        env: stackEnvironment(stackId, { HAUS_LINEAR_API_ORIGIN: fakeLinearOrigin(ports) }),
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    const output = { stopped: false, text: '' };
    const exited = new Promise((resolve) => child.once('exit', (code) => resolve(code)));
    let markReady;
    const readied = new Promise((resolve) => {
        markReady = resolve;
    });
    for (const stream of [child.stdout, child.stderr]) {
        stream.on('data', (chunk) => {
            log.write(chunk);
            output.text = `${output.text}${chunk}`.slice(-20_000);
            output.stopped ||= /haus stack stopped/u.test(output.text);
            if (/Ready to go/u.test(output.text)) {
                markReady('ready');
            }
        });
    }
    const ready = await Promise.race([
        readied,
        exited.then((code) => `exited (${code})`),
        delay(bootTimeoutMs).then(() => 'timed out'),
    ]);
    const stack = { child, exited, log, output, ports, root, stackId };
    if (ready !== 'ready') {
        await stopStack(stack);
        throw new Error(`Stack ${stackId} never became ready: ${ready}. See ${logFile}.`);
    }
    return stack;
}

/** SIGTERM, wait for "haus stack stopped", then report anything left behind. */
export async function stopStack(stack) {
    if (stack.child.exitCode === null && stack.child.signalCode === null) {
        stack.child.kill('SIGTERM');
        const outcome = await Promise.race([
            stack.exited,
            delay(stopTimeoutMs).then(() => 'timeout'),
        ]);
        if (outcome === 'timeout') {
            // A second SIGTERM takes the controller's forced path.
            stack.child.kill('SIGTERM');
            await Promise.race([stack.exited, delay(30_000)]);
        }
    }
    await new Promise((resolve) => stack.log.end(resolve));
    return { cleanStop: stack.output.stopped, leftovers: findLeftovers(stack) };
}

/** Mounted workspace images and listening processes still tied to this stack id. */
export function findLeftovers({ ports, stackId }) {
    const leftovers = [];
    const stateRoot = path.join(os.homedir(), '.haus', 'dev', stackId);
    const mounts = run('mount', [])
        .split('\n')
        .filter((entry) => entry.includes(`${stateRoot}/`));
    leftovers.push(
        ...mounts.map((entry) => `mounted ${entry.split(' on ')[1]?.split(' (')[0] ?? entry}`)
    );
    leftovers.push(...listeningPids(ports).map((pid) => `pid ${pid} still listening`));
    const holders = run('pgrep', ['-f', `${stateRoot}/`])
        .split('\n')
        .filter(Boolean);
    leftovers.push(...holders.map((pid) => `pid ${pid} still running against ${stateRoot}`));
    return leftovers;
}

function listeningPids(ports) {
    return [ports.hausPort, ports.websitePort].flatMap((port) =>
        run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'])
            .split('\n')
            .filter(Boolean)
    );
}

/** stdout of a read-only probe; a non-zero exit (lsof with no match) is an empty answer. */
function run(command, args) {
    try {
        return execFileSync(command, args, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        });
    } catch (error) {
        return typeof error.stdout === 'string' ? error.stdout : '';
    }
}

/** An unref'd timer: a pending race never keeps the process alive on its own. */
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms).unref?.());
}
