// The eval's command line: every flag is resolved and validated here so the
// run script itself only deals with an already-legal configuration.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRuntimeById } from '../../apps/computer/src/runtime-discovery.ts';
import { directRuntimeIds } from './direct-runner.mjs';
import { visualsBattery } from './prompts.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Exits the process with a usage error rather than throwing a stack trace. */
export const assert = (condition, message) => {
    if (!condition) {
        process.stderr.write(`${message}\n`);
        process.exit(2);
    }
};

export const resolveRunConfig = () => {
    const [runtimeId, modelId] = parseModelFlag(flagValue('--model'));
    const reasoningEffort = flagValue('--reasoning') ?? 'medium';
    assert(
        ['high', 'low', 'medium'].includes(reasoningEffort),
        `--reasoning expects low, medium or high; received ${reasoningEffort}`
    );
    const runnerId = flagValue('--runner') ?? 'harness';
    assert(
        ['direct', 'harness'].includes(runnerId),
        `--runner expects harness or direct; received ${runnerId}`
    );
    assert(
        runnerId === 'harness' || directRuntimeIds.includes(runtimeId),
        `--runner direct drives ${directRuntimeIds.join(' and ')} only; received ${runtimeId}`
    );
    const width = Number(flagValue('--width') ?? 736);
    assert(Number.isFinite(width) && width > 0, '--width expects a positive number');
    const skillDirFlag = flagValue('--skill-dir');
    const onlyFilter = flagValue('--only');
    const items = visualsBattery.filter((item) => !onlyFilter || item.slug.includes(onlyFilter));
    assert(items.length > 0, `--only ${onlyFilter} matched no battery items`);

    const executable = resolveRuntimeById(runtimeId);
    assert(
        executable,
        `no installed executable for runtime "${runtimeId}"; install it or pick another --model`
    );

    const stamp = new Date().toISOString().replaceAll(/[:T]/gu, '-').slice(0, 19);
    const runLabel = `${runtimeId}/${modelId}-${reasoningEffort}-${runnerId}`;
    const outDirFlag = flagValue('--out-dir');
    return {
        executable,
        items,
        modelId,
        outDir: outDirFlag
            ? path.resolve(outDirFlag)
            : path.join(here, 'output', `${stamp}-${slugify(runLabel)}`),
        reasoningEffort,
        runLabel,
        runnerId,
        runtimeId,
        skillDir: skillDirFlag ? path.resolve(skillDirFlag) : null,
        stamp,
        width,
    };
};

function parseModelFlag(value) {
    assert(value, 'pass --model <runtime>/<model>, e.g. --model grok-build/grok-4.6');
    const separator = value.indexOf('/');
    assert(separator > 0, `--model expects <runtime>/<model>; received ${value}`);
    return [value.slice(0, separator), value.slice(separator + 1)];
}

function slugify(value) {
    return value.replaceAll(/[^a-zA-Z0-9.-]+/gu, '-');
}

function flagValue(name) {
    const index = process.argv.indexOf(name);
    return index === -1 ? null : (process.argv[index + 1] ?? null);
}
