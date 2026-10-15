// Test fixtures: a saved agent-test run on disk, shaped like what cli.mjs,
// report.mjs and routing-evidence.mjs write, for the grader and report tests.

import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const agentId = 'agt_fixture';
const channelId = 'cht_channel';

const at = (second) => `2026-10-15T10:00:${String(second).padStart(2, '0')}.000Z`;
const human = (id, content, second, extra = {}) => ({
    author: { kind: 'human' },
    chatId: channelId,
    content,
    createdAt: at(second),
    id,
    ...extra,
});
const agent = (id, content, second, extra = {}) => ({
    author: { agentId, kind: 'agent' },
    chatId: channelId,
    content,
    createdAt: at(second),
    id,
    runId: 'run_live',
    ...extra,
});

/** A quick-fact run: one inline `--done` reply, as the spec wants. */
export function quickFactEvidence({ channel = channelId, reply = '43447.', inline = true } = {}) {
    const messages = [
        human('msg_fyi11111', 'fyi dev server port is 43447 this week', 1),
        human('msg_ask22222', 'what port is the dev server on again?', 2),
        agent('msg_ans33333', reply, 5, inline ? { reply: { rootMessageId: 'msg_ask22222' } } : {}),
    ];
    return {
        chats: [
            {
                chatId: channel,
                messages: messages.map((message) => ({ ...message, chatId: channel })),
                threads: [],
            },
        ],
        diagnostics: [{ agentId }],
        errors: [],
        journals: [
            {
                agentId,
                evidence: {
                    journal: {
                        tools: [
                            {
                                input: {
                                    command: `haus message send --done --target '#eval' --reply-to ask22222 <<'EOF'\n${reply}\nEOF`,
                                },
                            },
                        ],
                    },
                    status: 'available',
                },
                runId: 'run_live',
            },
        ],
    };
}

/**
 * Writes a run under `<root>/.context/agent-tests/<stamp>/` with one transcript
 * per scenario and routing evidence for those that pass `evidence`.
 */
export async function writeRun(root, stamp, scenarios) {
    const runDir = path.join(root, '.context/agent-tests', stamp);
    for (const scenario of scenarios) {
        await mkdir(path.join(runDir, scenario.name), { recursive: true });
        await writeFile(
            path.join(runDir, scenario.name, 'transcript.json'),
            JSON.stringify({
                chats: [{ id: scenario.evidence?.chats[0].chatId ?? channelId }],
                messages: scenario.messages ?? [],
            })
        );
        if (scenario.evidence) {
            const evidenceDir = path.join(
                root,
                '.context/agent-tests/evidence',
                stamp.replace('T', '')
            );
            await mkdir(evidenceDir, { recursive: true });
            await writeFile(
                path.join(evidenceDir, `${scenario.name}.json`),
                JSON.stringify(scenario.evidence)
            );
        }
    }
    const summary = {
        scenarios: scenarios.map(({ error, name, ok }) => ({
            assertions: [],
            name,
            ok,
            seconds: 30,
            ...(error ? { error } : {}),
        })),
        startedAt: at(0),
        wallSeconds: 60,
    };
    await writeFile(path.join(runDir, 'summary.json'), JSON.stringify(summary));
}

export async function temporaryRoot() {
    return await mkdtemp(path.join(os.tmpdir(), 'haus-eval-'));
}
