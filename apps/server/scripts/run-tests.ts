import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { startSharedTestPostgres } from '../test/postgres-cluster.ts';

const root = join(import.meta.dir, '..');
const durationsPath = join(root, 'node_modules', '.cache', 'haus-server-test-durations.json');
// WARNING: Bun's 5s default also bounds hooks, and a file's beforeAll boots a Server.
const testTimeoutMs = 30_000;
const slowestShown = 10;

const privateNetworkTestFiles = new Set([
    'test/haus-agent-run.test.ts',
    'test/mcp-inventory.test.ts',
    'test/mcp-oauth-reauth.test.ts',
    'test/mcp-oauth-relay.test.ts',
]);

interface FileResult {
    durationMs: number;
    failed: number;
    file: string;
    output: string;
    passed: number;
    status: number;
}

const requested = process.argv.slice(2);
const files = requested.length > 0 ? requested : discoverTestFiles();
const workers = Math.min(files.length, readWorkerCount());
const startedAt = performance.now();
const postgres = await startSharedTestPostgres();
const children = new Set<ReturnType<typeof spawn>>();

process.once('SIGINT', () => {
    for (const child of children) {
        child.kill('SIGINT');
    }
});

console.log(`Running ${files.length} Server test files on ${workers} workers.`);

const results: FileResult[] = [];
const previousDurations = readPreviousDurations();
const expectedCost = (file: string) => previousDurations[file] ?? statSync(join(root, file)).size;
const queue = [...files].sort((a, b) => expectedCost(b) - expectedCost(a));
await Promise.all(
    Array.from({ length: workers }, async () => {
        for (let file = queue.shift(); file; file = queue.shift()) {
            const result = await runTestFile(file, postgres.environment);
            results.push(result);
            printProgress(result);
        }
    })
);
await postgres.stop();
writeDurations(results);

const failures = results.filter((result) => result.status !== 0);
for (const failure of failures) {
    console.log(`\n${'='.repeat(80)}\nFAIL ${failure.file}\n${'='.repeat(80)}`);
    console.log(failure.output.trimEnd());
}

console.log(`\nSlowest ${Math.min(slowestShown, results.length)} files:`);
for (const result of [...results]
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, slowestShown)) {
    console.log(`  ${seconds(result.durationMs)}  ${result.file}`);
}

const passedTests = results.reduce((total, result) => total + result.passed, 0);
const failedTests = results.reduce((total, result) => total + result.failed, 0);
console.log(
    `\n${results.length - failures.length} of ${results.length} files passed, ${passedTests} tests passed, ${failedTests} failed, in ${seconds(performance.now() - startedAt)}.`
);
if (failures.length > 0) {
    console.log(`Failed files:\n${failures.map((failure) => `  ${failure.file}`).join('\n')}`);
}
process.exit(failures.length > 0 ? 1 : 0);

function runTestFile(file: string, postgresEnvironment: Record<string, string>) {
    const environment: NodeJS.ProcessEnv = { ...process.env, ...postgresEnvironment };
    if (privateNetworkTestFiles.has(file)) {
        environment.HAUS_MCP_ALLOW_PRIVATE_NETWORKS = 'true';
    }
    const fileStartedAt = performance.now();

    return new Promise<FileResult>((resolve) => {
        const child = spawn('bun', ['test', '--timeout', String(testTimeoutMs), file], {
            cwd: root,
            env: environment,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        children.add(child);
        let output = '';
        child.stdout.on('data', (chunk) => {
            output += String(chunk);
        });
        child.stderr.on('data', (chunk) => {
            output += String(chunk);
        });
        child.once('close', (code, signal) => {
            children.delete(child);
            resolve({
                durationMs: performance.now() - fileStartedAt,
                failed: countReported(output, 'fail'),
                file,
                output: signal ? `${output}\nKilled by ${signal}.` : output,
                passed: countReported(output, 'pass'),
                status: code ?? 1,
            });
        });
    });
}

function printProgress(result: FileResult) {
    const label = result.status === 0 ? 'pass' : 'FAIL';
    console.log(
        `${label}  ${seconds(result.durationMs).padStart(7)}  [${results.length}/${files.length}]  ${result.file}`
    );
}

function readWorkerCount() {
    const configured = process.env.HAUS_TEST_WORKERS;
    if (configured === undefined) {
        return Math.max(1, Math.floor(availableParallelism() / 2));
    }
    const count = Number(configured);
    if (!Number.isInteger(count) || count < 1) {
        throw new Error(`HAUS_TEST_WORKERS must be a positive integer, not "${configured}".`);
    }
    return count;
}

function countReported(output: string, outcome: 'fail' | 'pass') {
    return Number(new RegExp(`^\\s*(\\d+) ${outcome}$`, 'mu').exec(output)?.[1] ?? 0);
}

function readPreviousDurations() {
    const durations: Record<string, number> = existsSync(durationsPath)
        ? JSON.parse(readFileSync(durationsPath, 'utf8'))
        : {};
    return durations;
}

function writeDurations(finished: FileResult[]) {
    const durations = {
        ...readPreviousDurations(),
        ...Object.fromEntries(finished.map((result) => [result.file, result.durationMs])),
    };
    mkdirSync(dirname(durationsPath), { recursive: true });
    writeFileSync(durationsPath, JSON.stringify(durations));
}

function seconds(milliseconds: number) {
    return `${(milliseconds / 1000).toFixed(1)}s`;
}

function discoverTestFiles() {
    return ['test', 'src']
        .flatMap((directory) =>
            readdirSync(join(root, directory), { recursive: true, withFileTypes: true })
        )
        .filter((entry) => entry.isFile() && entry.name.endsWith('.test.ts'))
        .map((entry) => relative(root, join(entry.parentPath, entry.name)))
        .sort();
}
