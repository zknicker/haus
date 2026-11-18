import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateComputerState } from './migrate-computer-state.mjs';

test('moves Computer state, preserves credentials and work, and previews without writes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-state-migration-'));
    const sourceRoot = join(root, 'previous');
    const destinationRoot = join(root, 'haus');
    const session = 'servers/srv_one/agents/agt_one/session.json';
    const options = {
        sourceRoot,
        destinationRoot,
        sourcePrefix: 'previous',
        sourceOrigin: 'https://previous.example',
        backupRoot: join(root, 'backup'),
    };
    try {
        await mkdir(join(sourceRoot, 'servers/srv_one/agents/agt_one'), { recursive: true });
        await writeFile(
            join(sourceRoot, 'login.json'),
            JSON.stringify({
                origin: options.sourceOrigin,
                accessToken: 'secret-kept',
            })
        );
        await writeFile(
            join(sourceRoot, session),
            JSON.stringify({
                previousAgentStatus: 'current',
                previousAgentVersion: '1.5.0',
                runtimeSessionId: 'engine-session-kept',
                resumeState: { cwd: join(sourceRoot, 'work') },
            })
        );
        await writeFile(join(sourceRoot, 'work.txt'), 'User-authored work stays byte-identical.');
        const preview = await migrateComputerState(options);
        expect(preview.files).toEqual(['login.json', session]);
        expect(existsSync(destinationRoot)).toBe(false);
        await migrateComputerState({ ...options, apply: true });
        expect(existsSync(sourceRoot)).toBe(false);
        expect(JSON.parse(await readFile(join(destinationRoot, 'login.json'), 'utf8'))).toEqual({
            origin: 'https://haus.chat',
            accessToken: 'secret-kept',
        });
        expect(JSON.parse(await readFile(join(destinationRoot, session), 'utf8'))).toEqual({
            hausAgentStatus: 'current',
            hausAgentVersion: '1.5.0',
            runtimeSessionId: 'engine-session-kept',
            resumeState: { cwd: join(destinationRoot, 'work') },
        });
        expect(await readFile(join(destinationRoot, 'work.txt'), 'utf8')).toBe(
            'User-authored work stays byte-identical.'
        );
        expect(
            JSON.parse(await readFile(join(options.backupRoot, 'login.json'), 'utf8')).accessToken
        ).toBe('secret-kept');
        await expect(migrateComputerState({ ...options, apply: true })).rejects.toThrow(
            'Destination already exists'
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
