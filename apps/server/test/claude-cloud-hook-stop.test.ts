import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cloudAgentCallbackSchema } from '@haus/api';
import { claudeCloudHookScript } from '../src/cloud-agents/claude-cloud-hook-script.ts';

let root: string;
let script: string;
const sessionId = '7ff31e6a-1723-4389-ab35-234724361aa2';
beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'haus-native-stop-'));
    script = join(root, 'hook.py');
    await mkdir(join(root, 'state'));
    await writeFile(script, claudeCloudHookScript);
    await writeFile(join(root, 'config.json'), JSON.stringify({ origin: 'https://haus.test' }));
    await writeFile(
        join(root, 'state', `${sessionId}.json`),
        JSON.stringify({ token: 'synthetic-test-token' })
    );
});
afterAll(async () => {
    await rm(root, { recursive: true, force: true });
});

test('the real Python Stop hook emits no terminal callback when either registry is unavailable', () => {
    for (const fields of [
        {},
        { background_tasks: [] },
        { session_crons: [] },
        { background_tasks: null, session_crons: [] },
        { background_tasks: {}, session_crons: [] },
    ]) {
        expect(runStop(fields)).toEqual([]);
    }
});
test('the real Python Stop hook counts pending session crons as outstanding work', () => {
    const callbacks = runStop({ background_tasks: [], session_crons: [{ id: 'scheduled-wake' }] });
    expect(callbacks).toHaveLength(1);
    expect(cloudAgentCallbackSchema.parse(callbacks[0])).toMatchObject({
        kind: 'stop',
        backgroundTasks: 1,
        sessionCrons: 1,
    });
});
test('the real Python Stop hook permits completion only when both registries are known empty', () => {
    const callbacks = runStop({ background_tasks: [], session_crons: [] });
    expect(callbacks).toHaveLength(1);
    expect(cloudAgentCallbackSchema.parse(callbacks[0])).toMatchObject({
        kind: 'stop',
        backgroundTasks: 0,
    });
});

function runStop(fields: Record<string, unknown>): unknown[] {
    const child = Bun.spawnSync(['python3', '-c', pythonTransport, script, root], {
        stdin: Buffer.from(
            JSON.stringify({
                hook_event_name: 'Stop',
                session_id: sessionId,
                prompt_id: 'native-stop-proof',
                last_assistant_message: 'Finished response',
                ...fields,
            })
        ),
    });
    if (child.exitCode !== 0) {
        throw new Error(child.stderr.toString());
    }
    const result: unknown = JSON.parse(child.stdout.toString());
    if (!Array.isArray(result)) {
        throw new Error('Expected captured Python callbacks.');
    }
    return result;
}

// Run the shipped Python artifact; isolate its files and the external HTTP transport.
const pythonTransport = `import io, json, pathlib, runpy, sys, urllib.request
original = pathlib.Path
root = original(sys.argv[2])
def path(value):
    if str(value) == '/opt/haus-cloud': return root
    if str(value) == '/tmp/haus-cloud-native': return root / 'state'
    return original(value)
pathlib.Path = path
callbacks = []
def urlopen(request, timeout):
    callbacks.append(json.loads(request.data))
    return io.BytesIO(b'{}')
urllib.request.urlopen = urlopen
try:
    runpy.run_path(sys.argv[1], run_name='__main__')
except SystemExit as result:
    if result.code not in (None, 0): raise
json.dump(callbacks, sys.stdout)
`;
