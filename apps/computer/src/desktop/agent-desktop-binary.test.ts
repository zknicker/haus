import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    agentDesktopToolsRoot,
    installAgentDesktop,
    validateEmbeddedAgentDesktop,
} from './agent-desktop-binary.ts';

const pins = {
    'agent-desktop': '9a6b0829736a486da532a9d1ceed1e07192fa8967326c7b27125646adab6baf7',
    'agent-desktop-macos-helper':
        '87348178e546974ee0f96b74dd03410f61f4972cae5eb5fbd36bf04d2cb50a42',
};

async function digest(path: string) {
    return createHash('sha256')
        .update(await readFile(path))
        .digest('hex');
}

describe('embedded agent-desktop', () => {
    test('the embedded binaries match their pins', async () => {
        await validateEmbeddedAgentDesktop();
    });

    test('install writes both executables under the data root, verified', async () => {
        const dataRoot = await mkdtemp(join(tmpdir(), 'haus-agent-desktop-'));
        const toolsRoot = agentDesktopToolsRoot(dataRoot);
        const install = await installAgentDesktop(toolsRoot);

        expect(install).toEqual({
            executable: join(dataRoot, 'tools', 'agent-desktop', '1.3.1', 'agent-desktop'),
            helper: join(dataRoot, 'tools', 'agent-desktop', '1.3.1', 'agent-desktop-macos-helper'),
        });
        expect(await digest(install.executable)).toBe(pins['agent-desktop']);
        expect(await digest(install.helper)).toBe(pins['agent-desktop-macos-helper']);
        expect((await stat(install.executable)).mode & 0o777).toBe(0o755);
        expect((await stat(install.helper)).mode & 0o777).toBe(0o755);
    });

    test('a copy on disk that does not match its pin is replaced', async () => {
        const toolsRoot = agentDesktopToolsRoot(
            await mkdtemp(join(tmpdir(), 'haus-agent-desktop-'))
        );
        await mkdir(toolsRoot, { recursive: true });
        await writeFile(join(toolsRoot, 'agent-desktop'), 'tampered');

        const install = await installAgentDesktop(toolsRoot);

        expect(await digest(install.executable)).toBe(pins['agent-desktop']);
    });
});
