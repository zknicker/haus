import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { releaseTagArgs } from './release-publication.mjs';

test('Server publisher consumes prebuilt App artifacts without publishing desktop', async () => {
    const source = await readFile(new URL('./publish-release.mjs', import.meta.url), 'utf8');

    expect(source).not.toContain('release:check-desktop-artifacts');
    expect(source).not.toContain("run('bun', ['run', 'publish:desktop']");
    expect(source).not.toContain('HAUS_RELEASE_INCLUDE_DESKTOP');
    expect(source).not.toMatch(/\['commit'/u);
    expect(source).not.toMatch(/HEAD:\$\{/u);
});

test('annotated release tags carry a runner-local bot identity', () => {
    expect(releaseTagArgs('v1.2.3', 'a'.repeat(40))).toEqual([
        '-c',
        'user.name=github-actions[bot]',
        '-c',
        'user.email=41898282+github-actions[bot]@users.noreply.github.com',
        'tag',
        '-a',
        'v1.2.3',
        'a'.repeat(40),
        '-m',
        'v1.2.3',
    ]);
});
