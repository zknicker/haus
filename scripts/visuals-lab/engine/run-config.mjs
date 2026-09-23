// The run's command line: every flag is resolved and validated here so the run
// script itself only deals with an already-legal configuration.
//
// Driven by the visuals lab (`bun run visuals:lab`), which spawns run.mjs with
// these flags. There is no package script behind it.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRuntimeById } from '../../../apps/computer/src/runtime-discovery.ts';
import { stampFor } from '../paths.mjs';
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
    const width = Number(flagValue('--width') ?? 736);
    assert(Number.isFinite(width) && width > 0, '--width expects a positive number');
    const skillDirFlag = flagValue('--skill-dir');
    const onlyFilter = flagValue('--only');
    const items = selectItems(onlyFilter);
    assert(items.length > 0, `--only ${onlyFilter} matched no battery items`);

    const executable = resolveRuntimeById(runtimeId);
    assert(
        executable,
        `no installed executable for runtime "${runtimeId}"; install it or pick another --model`
    );

    const stamp = stampFor();
    const runLabel = `${runtimeId}/${modelId}-${reasoningEffort}`;
    const outDirFlag = flagValue('--out-dir');
    return {
        executable,
        items,
        modelId,
        outDir: outDirFlag
            ? path.resolve(outDirFlag)
            : path.join(here, '../results', `${stamp}-${slugify(runLabel)}`),
        reasoningEffort,
        runLabel,
        runtimeId,
        skillDir: skillDirFlag ? path.resolve(skillDirFlag) : null,
        stamp,
        width,
    };
};

/**
 * `--only` is a substring filter, but a slug that is also a prefix of longer
 * slugs would otherwise be impossible to run alone, so an exact slug wins.
 */
export function selectItems(onlyFilter, battery = visualsBattery) {
    if (!onlyFilter) {
        return battery;
    }
    const exact = battery.filter((item) => item.slug === onlyFilter);
    return exact.length > 0 ? exact : battery.filter((item) => item.slug.includes(onlyFilter));
}

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
