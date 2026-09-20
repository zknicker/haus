// What the lab actually spends: the queue of model turns, and the free
// fragment check beside it.
//
// Every queued job is a real model turn on this machine's own provider logins.
// Five run at once and the rest wait, so a "run everything" press is bounded
// by the queue rather than by how many processes Bun will start.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeRef, materializeBeforeSkill, repoRoot } from './before-skill.mjs';
import { modelById } from './models.mjs';
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

export const enqueue = (model, variant, only, effort) => {
    const job = {
        effort,
        finishedAt: null,
        id: `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        model,
        only: only ?? null,
        outDir: null,
        startedAt: null,
        status: 'queued',
        variant,
    };
    jobs.push(job);
    queue.push(job);
    pump();
    return job;
};

const pump = () => {
    while (running < maxConcurrent && queue.length > 0) {
        const job = queue.shift();
        running += 1;
        startJob(job).finally(() => {
            running -= 1;
            pump();
        });
    }
};

const startJob = async (job) => {
    const spec = modelById(job.model);
    const stamp = new Date().toISOString().replaceAll(/[:T]/gu, '-').slice(0, 19);
    const outDir = path.join(resultsDir, job.model, job.variant, stamp);
    await mkdir(outDir, { recursive: true });
    job.outDir = path.relative(resultsDir, outDir);
    job.startedAt = new Date().toISOString();
    job.status = 'running';

    const log = Bun.file(path.join(outDir, 'job.log')).writer();
    const args = [
        runScript,
        '--model',
        `${spec.runtime}/${spec.model}`,
        '--out-dir',
        outDir,
        '--reasoning',
        job.effort,
    ];
    if (job.variant === 'before' && !(await addBeforeSkill(args, log))) {
        job.finishedAt = new Date().toISOString();
        job.status = 'failed';
        await log.end();
        return;
    }
    if (job.only) {
        args.push('--only', job.only);
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

/**
 * Materializes the "before" skill and points the run at it. A ref the lab
 * cannot read fails this one cell with a readable message in its own log,
 * rather than taking down every queued run at once.
 */
const addBeforeSkill = async (args, log) => {
    try {
        const before = await materializeBeforeSkill(beforeRef());
        args.push('--skill-dir', before.dir);
        log.write(`before: ${before.ref} (${before.sha.slice(0, 8)}) → ${before.dir}\n`);
        log.write(`before carries: ${before.files.join(', ')}\n\n`);
        return true;
    } catch (error) {
        log.write(`could not materialize the before skill: ${String(error)}\n`);
        return false;
    }
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
