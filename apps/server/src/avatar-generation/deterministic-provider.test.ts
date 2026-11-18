import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DeterministicAvatarImageProvider } from './deterministic-provider.ts';

let temporaryDirectory = '';

afterEach(async () => {
    if (temporaryDirectory) {
        await rm(temporaryDirectory, { force: true, recursive: true });
        temporaryDirectory = '';
    }
});

test('returns stable image bytes and records one provider request without the concept', async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'haus-avatar-fixture-'));
    const requestLogPath = path.join(temporaryDirectory, 'requests.jsonl');
    const fixturePath = path.join(temporaryDirectory, 'fixture.png');
    await writeFile(fixturePath, Buffer.from('stable fixture bytes'));
    const provider = new DeterministicAvatarImageProvider(fixturePath, requestLogPath);

    const image = await provider.generate({
        model: 'gpt-image-2',
        numberOfImages: 1,
        outputFormat: 'png',
        prompt: 'do not persist this concept',
    });

    expect(image.mediaType).toBe('image/png');
    expect(image.bytes.byteLength).toBeGreaterThan(0);
    expect(await readFile(requestLogPath, 'utf8')).toBe(
        '{"count":1,"model":"gpt-image-2","numberOfImages":1,"outputFormat":"png"}\n'
    );
});
