import { afterEach, expect, spyOn, test } from 'bun:test';
import type { AgentApiRequest, AgentApiRequester } from '../agent-api-client.ts';
import { parseArgs, UsageError } from '../parse.ts';
import { ARTIFACT_SUBCOMMANDS, runArtifactList } from './agent-artifact.ts';
import { resolveArtifactId } from './artifact-target.ts';

const list = ARTIFACT_SUBCOMMANDS.find((sub) => sub.name === 'list');
const listCommand = { ...list, section: 'artifact' } as Parameters<typeof parseArgs>[0];
const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
afterEach(() => stdout.mockClear());

function client(response: unknown = { artifacts: [], folders: [], next_offset: null }) {
    const requests: { route: string; input?: AgentApiRequest }[] = [];
    const requester: AgentApiRequester = {
        request: <T>(route: string, _schema: unknown, input?: AgentApiRequest) => {
            requests.push({ route, input });
            return Promise.resolve(response as T);
        },
    };
    return { requester, requests };
}

test('list browses one folder and forwards the filters', async () => {
    const { requester, requests } = client();
    const args = parseArgs(listCommand, [
        'starter-kit/',
        '--recursive',
        '--query',
        'roadmap',
        '--mine',
        '--offset',
        '50',
    ]);
    await runArtifactList(args, requester);
    expect(requests).toEqual([
        {
            route: '/api/agent/artifacts',
            input: {
                query: {
                    prefix: 'starter-kit',
                    recursive: 'true',
                    offset: '50',
                    query: 'roadmap',
                    mine: 'true',
                },
            },
        },
    ]);
});

test('list without a folder reads the drive root and prints folders and files', async () => {
    const folder = {
        name: 'kit',
        path: 'kit',
        file_count: 2,
        updated_at: '2026-10-13T00:00:00.000Z',
    };
    const { requester, requests } = client({ artifacts: [], folders: [folder], next_offset: null });
    await runArtifactList(parseArgs(listCommand, []), requester);
    expect(requests[0]?.input?.query).toEqual({
        prefix: '',
        recursive: undefined,
        offset: '0',
        query: undefined,
        mine: undefined,
    });
    const printed = JSON.parse(String(stdout.mock.calls[0]?.[0]));
    expect(printed).toEqual({ folder: '', folders: [folder], files: [], next_offset: null });
});

test('list rejects invalid folders and extra arguments', async () => {
    const { requester } = client();
    await expect(runArtifactList(parseArgs(listCommand, ['../up']), requester)).rejects.toThrow(
        /Drive path/u
    );
    await expect(runArtifactList(parseArgs(listCommand, ['a', 'b']), requester)).rejects.toThrow(
        UsageError
    );
});

test('view targets resolve ids, pasted links, and drive paths', async () => {
    const { requester, requests } = client({ artifact: { artifact_id: 'art_frompath' } });
    expect(await resolveArtifactId(requester, 'art_abc123')).toBe('art_abc123');
    expect(
        await resolveArtifactId(
            requester,
            'https://haus.chat/s/demo/artifacts/art_xyz789?revision=rev_1'
        )
    ).toBe('art_xyz789');
    expect(requests).toHaveLength(0);
    expect(await resolveArtifactId(requester, 'reports/q4.pdf')).toBe('art_frompath');
    expect(requests[0]).toEqual({
        route: '/api/agent/artifacts/by-path',
        input: { query: { path: 'reports/q4.pdf' } },
    });
});

test('the artifact family is list, pull, push, mv, view, versions, delete, always JSON', () => {
    expect(ARTIFACT_SUBCOMMANDS.map((sub) => sub.name)).toEqual([
        'list',
        'pull',
        'push',
        'mv',
        'view',
        'versions',
        'delete',
    ]);
    for (const sub of ARTIFACT_SUBCOMMANDS) {
        expect(sub.flags.map((flag) => flag.name)).not.toContain('--json');
        expect(sub.usage).not.toMatch(/--json|--name|--artifact-id/u);
    }
    expect(() => parseArgs(listCommand, ['--json'])).toThrow(UsageError);
});
