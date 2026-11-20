import { afterEach, expect, test } from 'bun:test';
import { driveRoutes } from '../runner-drive-routes.ts';
import {
    drainCleanups,
    runCredential,
    type ServerStandIn,
    serverStandIn,
} from '../runner-test-server.ts';
import { readAgentContext } from './agent-context.ts';
import { composeTurnPrompt } from './instructions.ts';
import { ackManagedSkillNotice } from './managed-skill-notice.ts';

afterEach(drainCleanups);

const visualsRelease = 'a'.repeat(64);
const chartsRelease = 'b'.repeat(64);
const notice =
    '[Haus skill update: these Haus skills were updated: charts, visuals.] Re-read each before you next use it, and rebuild any scripts, notes, memory, or recipes you derived from it. If that changed something you rely on, post one short note in #all saying what you updated; otherwise do not post.';

test('a skill update rides the next turn input once, after the turn content', async () => {
    const pending: Record<string, string> = { charts: chartsRelease, visuals: visualsRelease };
    const server = serverStandIn({
        ...driveRoutes('blippy', new Map()),
        '/api/agent/managed-skills/notice': () => Response.json({ pending }),
        '/api/agent/managed-skills/notice/ack': (body) => {
            const { announced } = body as { announced: Record<string, string> };
            for (const [skillId, release] of Object.entries(announced)) {
                if (pending[skillId] === release) {
                    delete pending[skillId];
                }
            }
            return Response.json({ ok: true });
        },
    });

    expect(await completedTurn(server)).toBe(`Start.\n\n${notice}`);
    expect(await completedTurn(server)).toBe('Start.');
    expect(
        server.requests
            .filter((request) => request.path === '/api/agent/managed-skills/notice/ack')
            .map((request) => [request.authorization, request.body])
    ).toEqual([
        [
            `Bearer ${runCredential}`,
            { announced: { charts: chartsRelease, visuals: visualsRelease } },
        ],
    ]);
});

async function completedTurn(server: ServerStandIn) {
    const authority = { agentId: 'agt_1', runCredential, runId: 'run_1', serverUrl: server.url };
    const context = await readAgentContext({
        authority,
        log: (line) => {
            throw new Error(line);
        },
    });
    const prompt = composeTurnPrompt({
        instructions: { kind: 'current' },
        memoryBlock: null,
        rulesBlock: null,
        skillNotice: context.skillNotice,
        turnContent: 'Start.',
    });
    if (context.skillNotice) {
        await ackManagedSkillNotice(authority, context.skillNotice);
    }
    return prompt;
}
