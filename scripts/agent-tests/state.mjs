// The crash ledger. Every run records the Agents and chats it creates under
// its own run stamp; a later run sweeps whatever a crashed run left behind by
// EXACT recorded id — never by name pattern, handle shape, or age, so a sweep
// can only ever remove what an agent-test run itself created.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const agentTestsStateDirectory = path.join('.context', 'agent-tests');

/**
 * One ledger per dev stack: two stacks in one checkout (an eval build beside
 * the worktree's own stack) have different Servers, so neither may sweep ids
 * the other recorded.
 */
export function ledgerFileName(stackId) {
    const id = typeof stackId === 'string' ? stackId.trim() : '';
    return id ? `state.${id.replace(/[^\w.-]/gu, '_')}.json` : 'state.json';
}

export function createRunLedger({
    repositoryRoot = process.cwd(),
    stackId = process.env.HAUS_DEV_STACK_ID,
    stamp,
} = {}) {
    if (typeof stamp !== 'string' || stamp.trim().length === 0) {
        throw new Error('The agent-test ledger needs the run stamp it records under.');
    }
    const file = path.join(repositoryRoot, agentTestsStateDirectory, ledgerFileName(stackId));
    let cache = null;
    let queue = Promise.resolve();

    async function load() {
        cache ??= await readState(file);
        return cache;
    }

    function serialize(mutate) {
        queue = queue.then(async () => {
            const state = await load();
            const result = mutate(state);
            prune(state);
            await writeState(file, state);
            return result;
        });
        return queue;
    }

    function run(state) {
        state.runs[stamp] ??= { agents: [], chatIds: [] };
        return state.runs[stamp];
    }

    return {
        file,
        stamp,
        /** Records a created Agent, with the confirmation a delete will need. */
        rememberAgent(agent) {
            return serialize((state) => {
                const agents = run(state).agents;
                if (!agents.some((entry) => entry.id === agent.id)) {
                    agents.push({
                        displayName: agent.displayName,
                        handle: agent.handle ?? null,
                        id: agent.id,
                    });
                }
            });
        },
        /** Records a chat this run created so a crash cannot orphan it. */
        rememberChat(chatId) {
            return serialize((state) => {
                const chatIds = run(state).chatIds;
                if (!chatIds.includes(chatId)) {
                    chatIds.push(chatId);
                }
            });
        },
        /** Drops Agent ids a delete confirmed, in this run or a swept one. */
        forgetAgents(agentIds) {
            const removed = new Set(agentIds);
            return serialize((state) => {
                for (const entry of Object.values(state.runs)) {
                    entry.agents = entry.agents.filter((agent) => !removed.has(agent.id));
                }
            });
        },
        /** Drops chat ids a delete confirmed, in this run or a swept one. */
        forgetChats(chatIds) {
            const removed = new Set(chatIds);
            return serialize((state) => {
                for (const entry of Object.values(state.runs)) {
                    entry.chatIds = entry.chatIds.filter((chatId) => !removed.has(chatId));
                }
            });
        },
        /**
         * What earlier runs left behind. Reading never clears it: only a
         * confirmed delete may forget an id, so a failed sweep defers the ids
         * to the next run instead of orphaning them.
         */
        leftovers() {
            return serialize((state) =>
                Object.entries(state.runs)
                    .filter(([key]) => key !== stamp)
                    .map(([key, entry]) => ({
                        agents: [...entry.agents],
                        chatIds: [...entry.chatIds],
                        stamp: key,
                    }))
            );
        },
    };
}

function prune(state) {
    for (const [key, entry] of Object.entries(state.runs)) {
        if (entry.agents.length === 0 && entry.chatIds.length === 0) {
            delete state.runs[key];
        }
    }
}

async function readState(file) {
    try {
        const parsed = JSON.parse(await readFile(file, 'utf8'));
        const runs = {};
        for (const [key, entry] of Object.entries(parsed?.runs ?? {})) {
            runs[key] = {
                agents: Array.isArray(entry?.agents) ? entry.agents : [],
                chatIds: Array.isArray(entry?.chatIds) ? entry.chatIds : [],
            };
        }
        return adoptLegacyChats({ runs }, parsed?.chatsByHandle);
    } catch {
        return { runs: {} };
    }
}

/**
 * Chats the standing-pool ledger recorded per handle are still exact ids this
 * lane created, so they are adopted as one prior run and swept normally rather
 * than orphaned by the cutover.
 */
function adoptLegacyChats(state, chatsByHandle) {
    const chatIds = Object.values(chatsByHandle ?? {}).flatMap((owned) =>
        Array.isArray(owned) ? owned : []
    );
    if (chatIds.length > 0) {
        state.runs['standing-pool'] = { agents: [], chatIds };
    }
    return state;
}

async function writeState(file, state) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(state, null, 4)}\n`);
}
