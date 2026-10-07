// What the lab actually spends: the queue of model turns, and the free
// fragment check beside it.
//
// Every queued job is a real model turn on this machine's own provider logins.
// Five run at once and the rest wait, so a "run everything" press is bounded
// by the queue rather than by how many processes Bun will start.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkUniqueResultsDir, repoRoot, stampFor } from './paths.mjs';
import { resultsDir } from './run-reader.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const runScript = path.join(here, 'engine/run.mjs');
const fragmentScript = path.join(here, 'engine/render-fragments.mjs');
const maxConcurrent = 5;

const jobs = [];
const queue = [];
let running = 0;

/** The recent jobs the page shows; older ones fall off the end. */
export const recentJobs = () => jobs.slice(-40);

/** Queues one run of `column` (a model under a skill, see columns.mjs). */
export const enqueue = (column, only, effort) => {
    const job = {
        effort,
        finishedAt: null,
        id: `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        column: column.id,
        only: only ?? null,
        outDir: null,
        startedAt: null,
        status: 'queued',
    };
    jobs.push(job);
    // The column rides beside the job, not on it: the job is what the page polls.
    queue.push({ column, job });
    pump();
    return job;
};

const pump = () => {
    while (running < maxConcurrent && queue.length > 0) {
        const { column, job } = queue.shift();
        running += 1;
        startJob(job, column).finally(() => {
            running -= 1;
            pump();
        });
    }
};

const startJob = async (job, column) => {
    const outDir = await mkUniqueResultsDir(path.join(resultsDir, column.id), stampFor());
    job.outDir = path.relative(resultsDir, outDir);
    job.startedAt = new Date().toISOString();
    job.status = 'running';

    const log = Bun.file(path.join(outDir, 'job.log')).writer();
    const args = [
        runScript,
        '--model',
        `${column.runtime}/${column.model}`,
        '--out-dir',
        outDir,
        '--reasoning',
        job.effort,
    ];
    if (job.only) {
        args.push('--only', job.only);
    }
    if (column.skillDir) {
        args.push('--skill-dir', column.skillDir);
    }
    if (column.preview) {
        args.push('--preview');
    }

    log.write(`$ bun ${args.join(' ')}\n\n`);
    const child = Bun.spawn(['bun', ...args], { cwd: repoRoot, stderr: 'pipe', stdout: 'pipe' });
    await Promise.all([drain(child.stdout, log), drain(child.stderr, log)]);
    const code = await child.exited;
    log.write(`\n[exit ${code}]\n`);
    await log.end();
    job.finishedAt = new Date().toISOString();
    job.status = code === 0 ? 'done' : 'failed';
};

// The fragment check: the render-fragments engine over the working tree's own
// fences. No model turn, so it costs nothing but a browser — one at a time,
// and the page reads its output back verbatim.
export const fragmentCheck = { finishedAt: null, output: '', startedAt: null, status: 'idle' };

export const startFragmentCheck = async () => {
    if (fragmentCheck.status === 'running') {
        return;
    }
    fragmentCheck.finishedAt = null;
    fragmentCheck.output = '';
    fragmentCheck.startedAt = new Date().toISOString();
    fragmentCheck.status = 'running';
    // Nobody awaits this, so a throw here would otherwise leave the check
    // reading "running" forever and the page's button disabled for good.
    try {
        fragmentCheck.status = (await runFragmentCheck()) === 0 ? 'clean' : 'findings';
    } catch (error) {
        fragmentCheck.output += `\ncould not run the fragment check: ${String(error)}\n`;
        fragmentCheck.status = 'findings';
    }
    fragmentCheck.finishedAt = new Date().toISOString();
};

const runFragmentCheck = async () => {
    const child = Bun.spawn(['bun', fragmentScript], {
        cwd: repoRoot,
        stderr: 'pipe',
        stdout: 'pipe',
    });
    const decoder = new TextDecoder();
    const collect = async (stream) => {
        for await (const chunk of stream) {
            fragmentCheck.output += decoder.decode(chunk);
        }
    };
    await Promise.all([collect(child.stdout), collect(child.stderr)]);
    return await child.exited;
};

async function drain(stream, log) {
    for await (const chunk of stream) {
        log.write(chunk);
        log.flush();
    }
}
