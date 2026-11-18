import { expect, test } from 'bun:test';
import { runImageGenerate } from '../image-generate.ts';
import { args, harness, ready } from './agent-image-test-fixtures.ts';

test('workspace-path references upload first; attachment ids pass through', async () => {
    const h = harness({ files: { 'refs/style.png': 3 }, polls: [ready] });
    await runImageGenerate(
        args({}, { '--reference': ['refs/style.png', 'att_existing9'] }),
        h.deps
    );
    expect(h.requests[0]?.path).toBe('/api/agent/attachments/upload');
    expect(h.requests[0]?.body).toMatchObject({ filename: 'style.png', mediaType: 'image/png' });
    expect(h.requests[1]?.body).toMatchObject({
        referenceAttachmentIds: ['att_uploaded', 'att_existing9'],
    });
});

test('base64url attachment ids with - and _ pass through as references', async () => {
    const h = harness({ polls: [ready] });
    await runImageGenerate(args({}, { '--reference': ['att_a-b_c9', 'att_-lead_'] }), h.deps);
    expect(h.requests[0]?.body).toMatchObject({
        referenceAttachmentIds: ['att_a-b_c9', 'att_-lead_'],
    });
});

test('a reference that is neither a file nor an attachment id is refused', async () => {
    const h = harness({ polls: [ready] });
    await expect(
        runImageGenerate(args({}, { '--reference': ['missing/file.png'] }), h.deps)
    ).rejects.toMatchObject({ code: 'INVALID_ARG' });
    expect(h.requests).toEqual([]);
});
