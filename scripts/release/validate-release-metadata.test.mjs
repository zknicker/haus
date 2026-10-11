import { afterEach, expect, test } from 'bun:test';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const releaseScriptRoot = fileURLToPath(new URL('.', import.meta.url));
const temporaryRoots = [];

afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })));
});

test('release validation rejects target metadata that drifts from releases.json', async () => {
    const root = await createFixture();
    const command = ['node', join(root, 'scripts/release/validate-release-metadata.mjs')];

    const valid = Bun.spawnSync(command, { cwd: root, stderr: 'pipe', stdout: 'pipe' });
    expect(valid.exitCode).toBe(0);

    await writeFile(join(root, 'apps/computer/package.json'), '{"version":"1.4.7"}\n');
    const drifted = Bun.spawnSync(command, { cwd: root, stderr: 'pipe', stdout: 'pipe' });

    expect(drifted.exitCode).toBe(1);
    expect(drifted.stderr.toString()).toContain(
        'Computer package version 1.4.7 must match releases.json 1.4.8'
    );
});

async function createFixture() {
    const root = await mkdtemp(join(tmpdir(), 'haus-release-validation-'));
    temporaryRoots.push(root);
    await Promise.all(
        [
            'apps/computer',
            'apps/website/electron',
            'apps/ios-swift/Haus.xcodeproj',
            'packages/haus-api',
            'scripts/release',
        ].map((directory) => mkdir(join(root, directory), { recursive: true }))
    );
    await Promise.all(
        [
            'release-impact.mjs',
            'release-impact-paths.mjs',
            'release-ledger.mjs',
            'release-utils.mjs',
            'release-version-metadata.mjs',
            'validate-release-metadata.mjs',
        ].map((file) =>
            copyFile(join(releaseScriptRoot, file), join(root, 'scripts/release', file))
        )
    );
    await writeFile(join(root, 'apps/website/package.json'), '{"version":"1.8.22"}\n');
    await writeFile(join(root, 'apps/computer/package.json'), '{"version":"1.4.8"}\n');
    await writeFile(join(root, 'packages/haus-api/haus-agent.json'), '{"version":"1.0.0"}\n');
    await writeFile(join(root, 'packages/haus-api/haus-product.json'), '{"version":"1.8.39"}\n');
    await writeFile(
        join(root, 'apps/website/electron-builder.config.cjs'),
        "module.exports = { appId: 'chat.haus.desktop', files: [] };\n"
    );
    await writeFile(join(root, 'apps/website/electron/main.cjs'), "console.log('test');\n");
    await writeFile(join(root, 'CHANGELOG.md'), '## v1.8.39 - 2026-08-28\n\nRelease.\n');
    await writeFile(
        join(root, 'apps/ios-swift/project.yml'),
        'CURRENT_PROJECT_VERSION: "6"\nMARKETING_VERSION: 1.0.5\n'
    );
    await writeFile(
        join(root, 'apps/ios-swift/Haus.xcodeproj/project.pbxproj'),
        'CURRENT_PROJECT_VERSION = 6;\nMARKETING_VERSION = 1.0.5;\n'
    );
    await writeFile(
        join(root, 'bun.lock'),
        '{\n  "workspaces": {\n    "apps/computer": {\n      "version": "1.4.8",\n    },\n    "apps/website": {\n      "version": "1.8.22",\n    },\n  },\n}\n'
    );
    await writeFile(
        join(root, 'releases.json'),
        `${JSON.stringify(
            [
                {
                    version: '1.8.38',
                    date: '2026-08-28',
                    targets: {
                        server: '1.8.38',
                        app: '1.8.22',
                        ios: { version: '1.0.5', buildNumber: 6 },
                        computer: '1.4.8',
                        agent: '1.0.0',
                    },
                },
                {
                    version: '1.8.39',
                    date: null,
                    targets: {
                        server: 'undecided',
                        app: 'undecided',
                        ios: 'undecided',
                        computer: 'undecided',
                        agent: 'undecided',
                    },
                },
            ],
            null,
            2
        )}\n`
    );
    return root;
}
