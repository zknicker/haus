import { type LinearCallMeta, linearUploadMaxBytes } from '@haus/api/linear-actor-meta';
import * as z from 'zod';
import type { LinearCallContext } from '../call-context.ts';
import { defineTool, flatten, issueArg } from '../tool.ts';
import { inputError, LinearToolError } from '../tool-error.ts';
import { createComment } from './comment-create.ts';
import { resolveIssueId } from './linear-refs.ts';

type Upload = NonNullable<LinearCallMeta['upload']>;

export const uploadImage = defineTool({
    name: 'upload_image',
    description:
        'Post a Haus Files image (PNG, JPEG, GIF, or WebP, up to 10 MiB) on a Linear issue as a comment. Takes a file id, never a path.',
    input: z
        .object({
            alt: z.string().trim().min(1).max(200).optional(),
            artifactId: z.string().trim().min(1).max(100).describe('Haus Files id.'),
            issue: issueArg,
            revisionId: z.string().trim().min(1).max(100).optional(),
        })
        .strict(),
    readOnly: false,
    async run(context, input) {
        const upload = context.meta.upload;
        if (!upload) {
            throw new Error('Linear upload source is missing from the request.');
        }
        const issueId = await resolveIssueId(context, input.issue);
        const bytes = await readSource(context, upload);
        const assetUrl = await putAsset(context, upload, bytes);
        const alt = (input.alt ?? upload.filename).replaceAll(/[[\]]/gu, '');
        const comment = await createComment(context, {
            body: `![${alt}](${assetUrl})`,
            issueId,
            opIndex: 0,
        });
        return { assetUrl, comment: flatten(comment) };
    },
});

/** The frozen revision bytes behind the Server's signed source URL. */
async function readSource(context: LinearCallContext, upload: Upload): Promise<ArrayBuffer> {
    let response: Response;
    try {
        response = await context.fetch(upload.url, {
            redirect: 'error',
            signal: context.signal,
        });
    } catch {
        throw new LinearToolError('linear_upstream_error', 'The Haus file could not be read.');
    }
    if (!response.ok) {
        throw new LinearToolError('linear_artifact_unavailable', 'The Haus file is unavailable.');
    }
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== upload.size || bytes.byteLength > linearUploadMaxBytes) {
        throw new LinearToolError('linear_artifact_unavailable', 'The Haus file changed size.');
    }
    return bytes;
}

/** Linear's `fileUpload` signs a storage PUT; the asset URL is private to the workspace. */
async function putAsset(context: LinearCallContext, upload: Upload, bytes: ArrayBuffer) {
    const data = await context.linear.request<{
        fileUpload: {
            success: boolean;
            uploadFile: {
                assetUrl: string;
                headers: { key: string; value: string }[];
                uploadUrl: string;
            } | null;
        };
    }>(
        `mutation FileUpload($contentType: String!, $filename: String!, $size: Int!) {
            fileUpload(contentType: $contentType, filename: $filename, size: $size) {
                success uploadFile { uploadUrl assetUrl headers { key value } }
            }
        }`,
        { contentType: upload.contentType, filename: upload.filename, size: upload.size }
    );
    const target = data.fileUpload.uploadFile;
    if (!(data.fileUpload.success && target)) {
        throw inputError('Linear refused the upload.');
    }
    const headers = new Headers({
        'Cache-Control': 'public, max-age=31536000',
        'Content-Type': upload.contentType,
    });
    for (const header of target.headers) {
        headers.set(header.key, header.value);
    }
    let response: Response;
    try {
        response = await context.fetch(target.uploadUrl, {
            body: bytes,
            headers,
            method: 'PUT',
            redirect: 'error',
            signal: context.signal,
        });
    } catch {
        throw new LinearToolError(
            'linear_upstream_error',
            'Linear storage did not accept the image.'
        );
    }
    if (!response.ok) {
        throw new LinearToolError(
            'linear_upstream_error',
            'Linear storage did not accept the image.'
        );
    }
    return target.assetUrl;
}
