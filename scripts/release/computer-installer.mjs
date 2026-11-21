import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { repoRoot } from './release-utils.mjs';

export async function renderComputerInstaller(input) {
    const template = await readFile(
        path.join(repoRoot, 'scripts', 'release', 'install-haus-computer.sh'),
        'utf8'
    );
    const rendered = template
        .replaceAll('__HAUS_APPLE_TEAM_ID__', input.appleTeamId)
        .replaceAll('__HAUS_APPLE_SIGNING_IDENTITY__', input.appleSigningIdentity)
        .replaceAll('__HAUS_COMPUTER_BUNDLE_ID__', input.bundleId);
    const installerPath = path.join(repoRoot, 'apps', 'computer', 'release', 'install.sh');
    await writeFile(installerPath, rendered, { mode: 0o755 });
    return installerPath;
}
