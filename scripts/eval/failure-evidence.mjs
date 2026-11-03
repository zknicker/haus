// Copies the evidence a failed scenario left (heartbeat scenarios write one JSON file
// each under .context/agent-tests/heartbeat) next to the pass log, so a failed eval
// pass carries what the Agents reported, claimed, and posted.

import { copyFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export const heartbeatEvidencePath = path.join('.context', 'agent-tests', 'heartbeat');

/**
 * For each failed scenario, the newest `<stamp>-<name>.json` in `evidenceDir` written
 * at or after `sinceMs`, copied to `<outDir>/<prefix>-<name>.evidence.json`. Returns
 * the copied paths; a scenario that left no evidence is skipped.
 */
export async function saveFailureEvidence({ evidenceDir, failed, outDir, prefix, sinceMs }) {
    const entries = await readdir(evidenceDir).catch(() => []);
    const saved = [];
    for (const name of failed) {
        const candidates = entries.filter((entry) => entry.endsWith(`-${name}.json`));
        let newest = null;
        for (const entry of candidates) {
            const { mtimeMs } = await stat(path.join(evidenceDir, entry));
            if (mtimeMs >= sinceMs && (!newest || mtimeMs > newest.mtimeMs)) {
                newest = { entry, mtimeMs };
            }
        }
        if (newest) {
            const target = path.join(outDir, `${prefix}-${name}.evidence.json`);
            await copyFile(path.join(evidenceDir, newest.entry), target);
            saved.push(target);
        }
    }
    return saved;
}

/** Names of the scenarios a run's summary.json marks failed. */
export function failedScenarios(summary) {
    return (summary.scenarios ?? []).filter((entry) => !entry.ok).map((entry) => entry.name);
}
