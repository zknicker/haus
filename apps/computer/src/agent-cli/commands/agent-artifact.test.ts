import { afterEach, expect, spyOn, test } from 'bun:test';
import type { AgentApiRequest, AgentApiRequester } from '../agent-api-client.ts';
import { parseArgs, UsageError } from '../parse.ts';
import {
    ARTIFACT_SUBCOMMANDS,
    artifactNameError,
    publishTarget,
    runArtifactList,
} from './agent-artifact.ts';

const list = ARTIFACT_SUBCOMMANDS.find((sub) => sub.name === 'list');
const listCommand = { ...list, section: 'artifact' } as Parameters<typeof parseArgs>[0];
const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
afterEach(() => stdout.mockClear());

function client() {
    const requests: { route: string; input?: AgentApiRequest }[] = [];
    const requester: AgentApiRequester = {
        request: <T>(route: string, _schema: unknown, input?: AgentApiRequest) => {
            requests.push({ route, input });
            return Promise.resolve({ artifacts: [] } as T);
        },
    };
    return { requester, requests };
}

test('list forwards --query and --mine as Server filters', async () => {
    const { requester, requests } = client();
    const args = parseArgs(listCommand, ['--query', 'roadmap', '--mine', '--offset', '50']);
    await runArtifactList(args, requester);
    expect(requests).toEqual([
        {
            route: '/api/agent/artifacts',
            input: { query: { offset: '50', query: 'roadmap', mine: 'true' } },
        },
    ]);
});

test('list without filters sends neither filter', async () => {
    const { requester, requests } = client();
    await runArtifactList(parseArgs(listCommand, []), requester);
    expect(requests[0]?.input?.query).toEqual({ offset: '0', query: undefined, mine: undefined });
});

test('artifact commands no longer take the no-op --json flag; output is always JSON', () => {
    for (const sub of ARTIFACT_SUBCOMMANDS) {
        expect(sub.flags.map((flag) => flag.name)).not.toContain('--json');
        expect(sub.usage).not.toContain('--json');
    }
    expect(() => parseArgs(listCommand, ['--json'])).toThrow(UsageError);
});

test('publish needs neither --name nor --artifact-id, but refuses both', () => {
    const publish = ARTIFACT_SUBCOMMANDS.find((sub) => sub.name === 'publish');
    const command = { ...publish, section: 'artifact' } as Parameters<typeof parseArgs>[0];
    const parse = (extra: string[]) =>
        publishTarget(parseArgs(command, ['--path', 'a.md', '--title', 'A', ...extra]));
    expect(parse([])).toEqual({ name: undefined, artifactId: undefined });
    expect(parse(['--name', 'notes'])).toEqual({ name: 'notes', artifactId: undefined });
    expect(parse(['--artifact-id', 'art_1'])).toEqual({ name: undefined, artifactId: 'art_1' });
    expect(() => parse(['--name', 'notes', '--artifact-id', 'art_1'])).toThrow(
        'Pass --artifact-id to add a revision or --name to create, not both.'
    );
    expect(() => parse(['--name', 'Notes.md'])).toThrow('Try --name notes.');
});

test('publish rejects a filename-shaped --name before upload and suggests a valid one', () => {
    expect(artifactNameError('q4-report')).toBeNull();
    expect(artifactNameError('NOTES-X.md')).toBe(
        '--name must be lowercase-kebab with no extension. Try --name notes-x. The file keeps its own filename.'
    );
    expect(artifactNameError('...')).toBe(
        '--name must be lowercase-kebab with no extension. The file keeps its own filename.'
    );
});
