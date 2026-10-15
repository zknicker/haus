import { describe, expect, test } from 'bun:test';
import { linearClientEntityId } from '@haus/api/linear-actor-meta';
import { callTool, data, fakeLinear, issueNode, workspaceMeta } from './fake-linear.ts';

const op0 = linearClientEntityId(workspaceMeta.idSeed, 0);
const updatedAt = '2026-10-15T12:00:00.000Z';
const sourceUrl = 'https://haus.example/api/linear/artifact/token';
const uploadUrl = 'https://storage.googleapis.com/linear-uploads/put-target';
const assetUrl = 'https://uploads.linear.app/org/asset/mockup.png';
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const upload = {
    contentType: 'image/png' as const,
    filename: 'mockup.png',
    size: png.byteLength,
    url: sourceUrl,
};

describe('upload_image', () => {
    test('uploads the frozen revision through fileUpload and embeds it in a comment', async () => {
        const linear = fakeLinear(
            {
                CreateComment: (variables) =>
                    data({
                        commentCreate: {
                            comment: { id: (variables.input as { id: string }).id, updatedAt },
                            success: true,
                        },
                    }),
                FileUpload: () =>
                    data({
                        fileUpload: {
                            success: true,
                            uploadFile: {
                                assetUrl,
                                headers: [{ key: 'x-goog-content-length-range', value: '8,8' }],
                                uploadUrl,
                            },
                        },
                    }),
                IssueId: () => data({ issue: { id: issueNode.id } }),
            },
            {
                [sourceUrl]: () => new Response(png, { headers: { 'Content-Type': 'image/png' } }),
                [uploadUrl]: () => new Response(null, { status: 200 }),
            }
        );
        const { report, result } = await callTool(
            linear,
            'upload_image',
            { alt: 'Mockup [v2]', artifactId: 'art_CCCCCCCCCCCCCCCC', issue: 'DES-142' },
            { upload }
        );
        expect(result.structuredContent).toMatchObject({ assetUrl });
        expect(linear.requests.find((r) => r.operation === 'FileUpload')?.variables).toEqual({
            contentType: 'image/png',
            filename: 'mockup.png',
            size: png.byteLength,
        });
        const put = linear.urlRequests.find((request) => request.url === uploadUrl);
        expect(put?.init?.method).toBe('PUT');
        const headers = new Headers(put?.init?.headers);
        expect(headers.get('content-type')).toBe('image/png');
        expect(headers.get('x-goog-content-length-range')).toBe('8,8');
        expect(new Uint8Array(put?.init?.body as ArrayBuffer)).toEqual(png);
        expect(
            linear.requests.find((r) => r.operation === 'CreateComment')?.variables.input
        ).toMatchObject({ body: `![Mockup v2](${assetUrl})`, id: op0, issueId: issueNode.id });
        expect(report.mutations).toMatchObject([{ entityType: 'comment', opIndex: 0 }]);
    });

    test('a source that no longer matches the checked size is unavailable', async () => {
        const linear = fakeLinear(
            { IssueId: () => data({ issue: { id: issueNode.id } }) },
            { [sourceUrl]: () => new Response(png.slice(0, 4)) }
        );
        const { result } = await callTool(
            linear,
            'upload_image',
            { artifactId: 'art_CCCCCCCCCCCCCCCC', issue: 'DES-142' },
            { upload }
        );
        expect(result.structuredContent).toMatchObject({
            error: { code: 'linear_artifact_unavailable', retryable: false },
        });
    });
});

describe('reply', () => {
    const session = { linearSessionId: 'linear-session-1' };

    test('posts a response activity to the resolved Linear session', async () => {
        const linear = fakeLinear({
            Reply: () =>
                data({
                    agentActivityCreate: { agentActivity: { id: op0, updatedAt }, success: true },
                }),
        });
        const { report, result } = await callTool(
            linear,
            'reply',
            { body: 'Done: moved to print.', session: 'lss_DDDDDDDDDDDDDDDD', type: 'response' },
            { session }
        );
        expect(linear.requests[0]?.variables.input).toEqual({
            agentSessionId: 'linear-session-1',
            content: { body: 'Done: moved to print.', type: 'response' },
            id: op0,
        });
        expect(result.structuredContent).toEqual({
            activityId: op0,
            session: 'lss_DDDDDDDDDDDDDDDD',
            type: 'response',
        });
        expect(report.mutations[0]).toMatchObject({ entityType: 'agent_activity', created: true });
    });

    test('an action activity carries its action and parameter', async () => {
        const linear = fakeLinear({
            Reply: () =>
                data({
                    agentActivityCreate: { agentActivity: { id: op0, updatedAt }, success: true },
                }),
        });
        await callTool(
            linear,
            'reply',
            {
                body: 'Generating mockups',
                parameter: 'DES-142',
                session: 'lss_DDDDDDDDDDDDDDDD',
                type: 'action',
            },
            { session }
        );
        expect(linear.requests[0]?.variables.input).toMatchObject({
            content: { action: 'Generating mockups', parameter: 'DES-142', type: 'action' },
        });
    });
});

describe('whoami', () => {
    const answer = () =>
        data({
            organization: { name: 'Haus', urlKey: 'haus-chat' },
            viewer: { displayName: 'haus' },
        });

    test('without an identity the Agent posts through the Haus app', async () => {
        const { result } = await callTool(
            fakeLinear({ Whoami: answer }),
            'whoami',
            {},
            {
                self: { identityHandle: null },
            }
        );
        expect(result.structuredContent).toEqual({
            handle: 'haus',
            hasIdentity: false,
            postsAs: 'Juniper (via haus)',
            workspace: { name: 'Haus', urlKey: 'haus-chat' },
        });
    });

    test('with an identity the Agent has its own handle', async () => {
        const { result } = await callTool(
            fakeLinear({ Whoami: answer }),
            'whoami',
            {},
            {
                self: { identityHandle: 'juniper' },
            }
        );
        expect(result.structuredContent).toMatchObject({
            handle: 'juniper',
            hasIdentity: true,
            postsAs: '@juniper',
        });
    });
});
