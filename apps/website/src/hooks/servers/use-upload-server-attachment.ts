import type { AttachmentUploadResult } from '@haus/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getAppSessionAccessToken } from '../../lib/app-auth.tsx';
import { getHausServerOrigin, hausTrpc } from '../../lib/haus-server.tsx';
import { seedHostedAttachmentImage } from './attachment-image.ts';

export const attachmentMaxSizeBytes = 52_428_800;

export function useUploadServerAttachment() {
    const queryClient = useQueryClient();
    const reserve = hausTrpc.attachment.reserve.useMutation();

    return useMutation({
        mutationFn: async ({
            chatId,
            file,
            nonce,
            serverId,
        }: {
            chatId: string;
            file: File;
            nonce: string;
            serverId: string;
        }) => {
            if (file.size > attachmentMaxSizeBytes) {
                throw new Error(`${file.name} exceeds the 50 MiB attachment limit.`);
            }

            const reservation = await reserve.mutateAsync({
                chatId,
                filename: file.name,
                mediaType: file.type || 'application/octet-stream',
                nonce,
                serverId,
            });
            const token = getAppSessionAccessToken();
            if (!token) {
                throw new Error('Sign in to upload attachments.');
            }

            const response = await fetch(
                new URL(
                    `/attachments/${serverId}/${reservation.attachmentId}`,
                    getHausServerOrigin()
                ),
                {
                    body: file,
                    headers: {
                        authorization: `Bearer ${token}`,
                        'content-type': 'application/octet-stream',
                    },
                    method: 'PUT',
                }
            );
            const body = await response.json();
            if (!response.ok) {
                throw new Error(readError(body, `Could not upload ${file.name}.`));
            }
            const { attachment } = readUploadResult(body);
            if (attachment.mediaType.startsWith('image/')) {
                await seedHostedAttachmentImage(queryClient, {
                    attachmentId: attachment.id,
                    file,
                    nonce,
                    serverId,
                });
            }
            return attachment;
        },
    });
}

function readUploadResult(value: unknown): AttachmentUploadResult {
    if (
        typeof value !== 'object' ||
        value === null ||
        !('attachment' in value) ||
        typeof value.attachment !== 'object' ||
        value.attachment === null ||
        !('id' in value.attachment) ||
        !('filename' in value.attachment) ||
        !('mediaType' in value.attachment) ||
        !('sizeBytes' in value.attachment) ||
        typeof value.attachment.id !== 'string' ||
        typeof value.attachment.filename !== 'string' ||
        typeof value.attachment.mediaType !== 'string' ||
        typeof value.attachment.sizeBytes !== 'number' ||
        !('idempotent' in value) ||
        typeof value.idempotent !== 'boolean'
    ) {
        throw new Error('The Server returned an invalid attachment upload response.');
    }

    return value as AttachmentUploadResult;
}

function readError(value: unknown, fallback: string) {
    if (
        typeof value === 'object' &&
        value !== null &&
        'error' in value &&
        typeof value.error === 'string'
    ) {
        return value.error;
    }
    return fallback;
}
