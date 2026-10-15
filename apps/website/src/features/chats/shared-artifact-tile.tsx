import type { ArtifactMetadata } from '@haus/api';
import { ChatAttachment } from '@heroui-pro/react';
import { useArtifact } from '../../hooks/artifacts/use-artifact.ts';
import { artifactKindLabel } from '../artifacts/artifact-format.ts';
import { ArtifactFileIcon } from '../artifacts/icons/artifact-file-icon.tsx';
import { artifactFileKind } from '../artifacts/icons/artifact-file-kind.ts';
import { useArtifactCreatorDirectory } from '../artifacts/use-artifact-creator-directory.ts';
import { useArtifactPhoto } from '../artifacts/use-artifact-photo.ts';
import {
    mediaStripMarkSize,
    mediaStripPlaceholderClassName,
    mediaStripTileAttribute,
    mediaStripTileClassName,
    mediaStripTriggerClassName,
} from './message-media-strip.tsx';
import type { SharedArtifactLinkTarget } from './shared-artifact-link.ts';
import type { SharedArtifactScope } from './shared-artifact-scope.tsx';
import { useSharedArtifactOpen } from './use-shared-artifact-open.ts';

/**
 * One library artifact a message links to, as a tile in the message's media
 * strip. While its metadata reads the tile holds its box blank; one that is
 * missing or not visible renders nothing, and its inline link stays a link.
 */
export function SharedArtifactTile({
    scope,
    target,
}: {
    scope: SharedArtifactScope;
    target: SharedArtifactLinkTarget;
}) {
    const query = useArtifact(scope.serverId, target.artifactId, target.revisionId);
    const artifact = query.data?.artifact;
    if (artifact) {
        return <SharedArtifactTileView artifact={artifact} scope={scope} target={target} />;
    }
    return query.isPending ? (
        <div aria-hidden="true" className={mediaStripPlaceholderClassName} />
    ) : null;
}

export function SharedArtifactTileView({
    artifact,
    scope,
    target,
}: {
    artifact: ArtifactMetadata;
    scope: SharedArtifactScope;
    target: SharedArtifactLinkTarget;
}) {
    const open = useSharedArtifactOpen(scope.slug, target);
    const creators = useArtifactCreatorDirectory(scope.serverId);
    const photo = useArtifactPhoto(artifact, scope.serverId);
    const kind = artifactKindLabel(artifactFileKind(artifact));

    return (
        <a
            {...open}
            aria-label={`Open ${artifact.title}, ${kind}`}
            className={mediaStripTriggerClassName}
            data-testid="shared-artifact-tile"
            href={open.href}
            {...{ [mediaStripTileAttribute]: '' }}
        >
            {photo ? (
                // A decoded photo fills the tile like an attachment image does.
                <ChatAttachment
                    className={mediaStripTileClassName}
                    mediaType="image"
                    mimeType={artifact.content_type}
                    name={artifact.title}
                    src={photo}
                >
                    <ChatAttachment.Preview>
                        <img
                            alt=""
                            className="chat-attachment__preview-image"
                            height={132}
                            src={photo}
                            width={176}
                        />
                    </ChatAttachment.Preview>
                    <ChatAttachment.Info>
                        <ChatAttachment.Name />
                    </ChatAttachment.Info>
                </ChatAttachment>
            ) : (
                <ChatAttachment
                    className={mediaStripTileClassName}
                    mediaType="document"
                    mimeType={artifact.content_type}
                    name={artifact.title}
                    title={artifact.title}
                >
                    <ChatAttachment.Preview>
                        <ArtifactFileIcon
                            kind={artifactFileKind(artifact)}
                            size={mediaStripMarkSize}
                        />
                    </ChatAttachment.Preview>
                    <ChatAttachment.Info>
                        <ChatAttachment.Name />
                        <ChatAttachment.Size>
                            {kind} · {creators.name(artifact.creator)}
                        </ChatAttachment.Size>
                    </ChatAttachment.Info>
                </ChatAttachment>
            )}
        </a>
    );
}
