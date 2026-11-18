import { afterEach, expect, spyOn, test } from 'bun:test';
import type { AgentApiRequest, AgentApiRequester } from '../agent-api-client.ts';
import { parseArgs } from '../parse.ts';
import { ARTIFACT_SHARE_SUBCOMMAND, runArtifactShare } from './artifact-share.ts';

const command = { ...ARTIFACT_SHARE_SUBCOMMAND, section: 'files' } as Parameters<
    typeof parseArgs
>[0];
const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
afterEach(() => stdout.mockClear());

const url = 'https://haus.test/f/abcdefghijklmnopqrstuvwxyz012345';

function client(link: unknown) {
    const requests: { route: string; input?: AgentApiRequest }[] = [];
    const requester: AgentApiRequester = {
        request: <T>(route: string, _schema: unknown, input?: AgentApiRequest) => {
            requests.push({ route, input });
            return Promise.resolve({ artifact_id: 'art_abcdef1', link } as T);
        },
    };
    return { requester, requests };
}

test('share posts the public-link route for an id and prints the url', async () => {
    const { requester, requests } = client({
        can_disable: true,
        created_at: '2026-10-15T00:00:00.000Z',
        creator: { type: 'agent', agent_id: 'agt_1' },
        url,
    });
    await runArtifactShare(parseArgs(command, ['art_abcdef1']), requester);
    expect(requests).toEqual([
        { route: '/api/agent/artifacts/art_abcdef1/public-link', input: { method: 'POST' } },
    ]);
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0]))).toEqual({
        artifact_id: 'art_abcdef1',
        url,
    });
});

test('share --disable posts the disable route', async () => {
    const { requester, requests } = client(null);
    await runArtifactShare(
        parseArgs(command, ['https://haus.test/s/demo/artifacts/art_abcdef1', '--disable']),
        requester
    );
    expect(requests.map((request) => request.route)).toEqual([
        '/api/agent/artifacts/art_abcdef1/public-link/disable',
    ]);
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0]))).toEqual({
        artifact_id: 'art_abcdef1',
        disabled: true,
    });
});
