import { expect, test } from 'bun:test';
import type { AgentApiRequest, AgentApiRequester } from '../agent-api-client.ts';
import type { ParsedArgs } from '../parse.ts';
import { runAttachmentUpload } from './agent-attachment.ts';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);

function args(values: Record<string, string>): ParsedArgs {
    return { flags: {}, help: false, positionals: [], valueLists: {}, values };
}

function deps(data: Buffer) {
    const requests: AgentApiRequest[] = [];
    const client: AgentApiRequester = {
        request: <T>(_route: string, _schema: unknown, input?: AgentApiRequest) => {
            requests.push(input ?? {});
            return Promise.resolve({
                attachment: { filename: 'image.png', id: 'att_1a2b3c' },
            } as T);
        },
    };
    return {
        deps: {
            client,
            readFile: () => Promise.resolve(data),
            stat: () => Promise.resolve({ isFile: () => true, size: data.byteLength }),
            write: () => undefined,
            writeFile: () => Promise.resolve(),
        },
        requests,
    };
}

function sentMediaType(requests: AgentApiRequest[]): unknown {
    return (requests[0]?.body as { mediaType?: string }).mediaType;
}

test('upload sends the media type detected from the file content', async () => {
    const { deps: uploadDeps, requests } = deps(PNG);
    await runAttachmentUpload(args({ '--path': '/generated/ig_0abc' }), uploadDeps);
    expect(sentMediaType(requests)).toBe('image/png');
});

test('an explicit --mime-type wins over detection', async () => {
    const { deps: uploadDeps, requests } = deps(PNG);
    await runAttachmentUpload(
        args({ '--mime-type': 'application/x-custom', '--path': '/generated/image.png' }),
        uploadDeps
    );
    expect(sentMediaType(requests)).toBe('application/x-custom');
});

test('a blank --mime-type falls back to detection', async () => {
    const { deps: uploadDeps, requests } = deps(PNG);
    await runAttachmentUpload(args({ '--mime-type': ' ', '--path': 'image.png' }), uploadDeps);
    expect(sentMediaType(requests)).toBe('image/png');
});
