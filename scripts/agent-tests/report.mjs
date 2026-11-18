// Run reports: one summary.json per run plus one transcript.json per scenario,
// under .context/agent-tests/<stamp>/.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { agentTestsStateDirectory } from './state.mjs';

export function createReportWriter({ repositoryRoot = process.cwd(), stamp }) {
    const directory = path.join(repositoryRoot, agentTestsStateDirectory, stamp);

    async function write(file, payload) {
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, `${JSON.stringify(payload, null, 4)}\n`);
        return file;
    }

    return {
        directory,
        relativeDirectory: path.relative(repositoryRoot, directory),
        writeScenario(name, transcript) {
            return write(path.join(directory, slug(name), 'transcript.json'), transcript);
        },
        writeSummary(summary) {
            return write(path.join(directory, 'summary.json'), summary);
        },
    };
}

/** The transcript a scenario leaves behind: what it saw, and what settled. */
export function buildTranscript({ diagnostics = [], error, kit, result, scenario }) {
    const observed = kit?.transcript() ?? { chats: [], messages: [], turns: [] };
    return {
        agents: result?.agents ?? [],
        assertions: result?.assertions ?? [],
        chats: observed.chats,
        contract: scenario.contract,
        diagnostics,
        error: error ? String(error) : null,
        finishedAt: new Date().toISOString(),
        lastMessages: error ? observed.messages.slice(-20) : [],
        messages: observed.messages,
        name: scenario.name,
        ok: !error,
        seconds: result?.seconds ?? 0,
        settledTurns: observed.turns,
    };
}

export async function captureAgentDiagnostics(kit, agents) {
    return await Promise.all(
        agents.map(async ({ id: agentId }) => {
            const reads = {
                state: () => kit.turns.deliveryState(agentId),
                turns: () => kit.turns.listTurns(agentId),
                deliveries: () => kit.turns.listDeliveries(agentId),
            };
            const entries = await Promise.all(
                Object.entries(reads).map(async ([key, read]) => {
                    try {
                        return [key, await read()];
                    } catch (error) {
                        return [key, { error: String(error) }];
                    }
                })
            );
            return { agentId, ...Object.fromEntries(entries) };
        })
    );
}

export function buildSummary({ scenarios, startedAt, wallSeconds }) {
    return {
        scenarios: scenarios.map((entry) => ({
            assertions: entry.assertions ?? [],
            name: entry.name,
            ok: entry.ok,
            seconds: entry.seconds,
            ...(entry.error ? { error: String(entry.error) } : {}),
        })),
        startedAt,
        wallSeconds,
    };
}

export function slug(name) {
    return (
        name
            .toLowerCase()
            .replace(/[^a-z0-9]+/gu, '-')
            .replace(/^-|-$/gu, '') || 'scenario'
    );
}

export function runStamp(now = new Date()) {
    return now.toISOString().replace(/[-:.]/gu, '').replace(/Z$/u, '').slice(0, 15);
}
