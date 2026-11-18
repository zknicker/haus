import { type FileHandle, mkdir, rename, rm } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import type { ServerRuntime } from '../server-runtime.ts';
import {
    digest,
    ensureServerLayout,
    listRegularLeafNames,
    openRegularLeaf,
    requireAbsentLeaf,
    requireId,
    requirePrivateDirectory,
    requirePrivateDirectoryIfPresent,
    requireRegularLeaf,
    syncDirectory,
    unlinkRegularLeaf,
} from './attachment-root-filesystem.ts';
import { AttachmentWriteCoordinator } from './attachment-write-coordinator.ts';

const serverIdPattern = /^srv_[A-Za-z0-9_-]{16}$/u;
const attachmentIdPattern = /^att_[A-Za-z0-9_-]{16}$/u;
const stagingKeyPattern = /^upl_[A-Za-z0-9_-]{16}$/u;

export interface AttachmentRoot {
    /** Holds a Server write open so deletion cannot race its filesystem work. */
    beginServerWrite(serverId: string): () => void;
    createStagingFile(serverId: string, stagingKey: string): Promise<FileHandle>;
    /** Quiesces Server writes, then removes selected finalized and staging bytes. */
    discardAttachments(
        serverId: string,
        readAttachments: () => Promise<Array<{ attachmentId: string; stagingKey: string | null }>>
    ): Promise<void>;
    discardStagingFile(serverId: string, stagingKey: string): Promise<void>;
    finalize(serverId: string, attachmentId: string, stagingKey: string): Promise<void>;
    listKeys(serverId: string): Promise<{ objectKeys: string[]; stagingKeys: string[] }>;
    objectKey(serverId: string, attachmentId: string): string;
    openObject(serverId: string, attachmentId: string): Promise<FileHandle>;
    openStagingFile(serverId: string, stagingKey: string): Promise<FileHandle>;
    path: string;
    /** Removes one Server's whole attachment subtree. Idempotent when absent. */
    purgeServer(serverId: string): Promise<void>;
    stagingKey(serverId: string, stagingKey: string): string;
}

export interface AttachmentRootFailureInjection {
    afterRename?(): Promise<void> | void;
}

export async function openAttachmentRoot(
    rootPath: string,
    runtime: ServerRuntime,
    failureInjection?: AttachmentRootFailureInjection
): Promise<AttachmentRoot> {
    if (!isAbsolute(rootPath)) {
        throw new Error('The attachment root must be an absolute path.');
    }

    await mkdir(rootPath, { mode: 0o700, recursive: true });
    await requirePrivateDirectory(rootPath, 'attachment root');

    const serversPath = join(rootPath, 'servers');
    await mkdir(serversPath, { mode: 0o700, recursive: true });
    await requirePrivateDirectory(serversPath, 'attachment servers directory');

    const writes = new AttachmentWriteCoordinator(runtime);
    const attachmentRoot: AttachmentRoot = {
        beginServerWrite(serverId) {
            requireId(serverId, serverIdPattern, 'Server');
            return writes.begin(serverId);
        },
        async createStagingFile(serverId, stagingKey) {
            return await withServerWrite(attachmentRoot, serverId, async () => {
                const paths = await ensureServerLayout(rootPath, serverId);
                requireId(stagingKey, stagingKeyPattern, 'staging');
                return await openRegularLeaf(join(paths.staging, digest(stagingKey)), true);
            });
        },
        async discardStagingFile(serverId, stagingKey) {
            await withServerWrite(attachmentRoot, serverId, async () => {
                const paths = await ensureServerLayout(rootPath, serverId);
                requireId(stagingKey, stagingKeyPattern, 'staging');
                if (await unlinkRegularLeaf(join(paths.staging, digest(stagingKey)))) {
                    await syncDirectory(paths.staging);
                }
            });
        },
        async discardAttachments(serverId, readAttachments) {
            requireId(serverId, serverIdPattern, 'Server');
            await writes.runExclusive(serverId, async () => {
                const attachments = await readAttachments();
                for (const attachment of attachments) {
                    requireId(attachment.attachmentId, attachmentIdPattern, 'attachment');
                    if (attachment.stagingKey) {
                        requireId(attachment.stagingKey, stagingKeyPattern, 'staging');
                    }
                }
                const paths = await ensureServerLayout(rootPath, serverId);
                let objectsChanged = false;
                let stagingChanged = false;
                for (const attachment of attachments) {
                    objectsChanged =
                        (await unlinkRegularLeaf(
                            join(paths.objects, digest(`${serverId}\0${attachment.attachmentId}`))
                        )) || objectsChanged;
                    if (attachment.stagingKey) {
                        stagingChanged =
                            (await unlinkRegularLeaf(
                                join(paths.staging, digest(attachment.stagingKey))
                            )) || stagingChanged;
                    }
                }
                if (objectsChanged) {
                    await syncDirectory(paths.objects);
                }
                if (stagingChanged) {
                    await syncDirectory(paths.staging);
                }
            });
        },
        async finalize(serverId, attachmentId, stagingKey) {
            await withServerWrite(attachmentRoot, serverId, async () => {
                const paths = await ensureServerLayout(rootPath, serverId);
                requireId(attachmentId, attachmentIdPattern, 'attachment');
                requireId(stagingKey, stagingKeyPattern, 'staging');
                const stagingPath = join(paths.staging, digest(stagingKey));
                const objectPath = join(paths.objects, digest(`${serverId}\0${attachmentId}`));
                await requireRegularLeaf(stagingPath);
                await requireAbsentLeaf(objectPath);
                await rename(stagingPath, objectPath);
                await failureInjection?.afterRename?.();
                await syncDirectory(paths.objects);
                await syncDirectory(paths.staging);
            });
        },
        async listKeys(serverId) {
            return await withServerWrite(attachmentRoot, serverId, async () => {
                const paths = await ensureServerLayout(rootPath, serverId);
                return {
                    objectKeys: (await listRegularLeafNames(paths.objects)).map((name) =>
                        relative(rootPath, join(paths.objects, name))
                    ),
                    stagingKeys: (await listRegularLeafNames(paths.staging)).map((name) =>
                        relative(rootPath, join(paths.staging, name))
                    ),
                };
            });
        },
        objectKey(serverId, attachmentId) {
            requireId(serverId, serverIdPattern, 'Server');
            requireId(attachmentId, attachmentIdPattern, 'attachment');

            return relative(
                rootPath,
                join(
                    serversPath,
                    digest(serverId),
                    'objects',
                    digest(`${serverId}\0${attachmentId}`)
                )
            );
        },
        async openObject(serverId, attachmentId) {
            return await withServerWrite(attachmentRoot, serverId, async () => {
                const paths = await ensureServerLayout(rootPath, serverId);
                requireId(attachmentId, attachmentIdPattern, 'attachment');
                return await openRegularLeaf(
                    join(paths.objects, digest(`${serverId}\0${attachmentId}`)),
                    false
                );
            });
        },
        async openStagingFile(serverId, stagingKey) {
            return await withServerWrite(attachmentRoot, serverId, async () => {
                const paths = await ensureServerLayout(rootPath, serverId);
                requireId(stagingKey, stagingKeyPattern, 'staging');
                return await openRegularLeaf(join(paths.staging, digest(stagingKey)), false);
            });
        },
        path: rootPath,
        async purgeServer(serverId) {
            requireId(serverId, serverIdPattern, 'Server');
            await writes.runPermanentlyExclusive(serverId, async () => {
                await requirePrivateDirectory(rootPath, 'attachment root');
                await requirePrivateDirectory(serversPath, 'attachment servers directory');
                const serverPath = join(serversPath, digest(serverId));
                if (
                    !(await requirePrivateDirectoryIfPresent(
                        serverPath,
                        'attachment Server directory'
                    ))
                ) {
                    return;
                }
                await rm(serverPath, { force: true, recursive: true });
                await syncDirectory(serversPath);
            });
        },
        stagingKey(serverId, stagingKey) {
            requireId(serverId, serverIdPattern, 'Server');
            requireId(stagingKey, stagingKeyPattern, 'staging');
            return relative(
                rootPath,
                join(rootPath, 'servers', digest(serverId), 'staging', digest(stagingKey))
            );
        },
    };

    return attachmentRoot;
}

async function withServerWrite<Result>(
    root: AttachmentRoot,
    serverId: string,
    operation: () => Promise<Result>
) {
    const release = root.beginServerWrite(serverId);
    try {
        return await operation();
    } finally {
        release();
    }
}
