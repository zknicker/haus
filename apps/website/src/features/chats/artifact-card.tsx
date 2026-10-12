import type { WidgetArtifactProps } from '@haus/api/widgets/artifact';
import { ItemCard } from '@heroui-pro/react';
import { ArrowRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { artifactKindLabel } from '../artifacts/artifact-format.ts';
import { ArtifactFileIcon } from '../artifacts/icons/artifact-file-icon.tsx';
import { artifactFileKind } from '../artifacts/icons/artifact-file-kind.ts';
import { useArtifactPanelOpen } from './artifact-panel-context.tsx';

/**
 * The stock ItemCard every artifact under a message uses: the in-chat column
 * width and the chat card fill (`.item-card--message-object` in
 * `default-theme.css`). Interactive cards render as their own link or button.
 */
export const messageObjectCardClassName =
    'item-card--message-object w-full max-w-(--chat-card-width) text-left';

/**
 * Transcript card for an Agent's HTML artifact fence. The card reads nothing;
 * pressing it opens the workspace page in the Artifact Panel (its own tab on
 * desktop). Outside a panel context (static render, tests) it is inert.
 */
export function WidgetArtifactCard({ props }: { props: WidgetArtifactProps }) {
    const openArtifactPanel = useArtifactPanelOpen();
    const fileName = props.path.split('/').filter(Boolean).at(-1) ?? props.path;
    const title = props.title ?? fileName;
    const kind = artifactFileKind({ content_type: '', filename: fileName });
    // One representation per fact: the file name only when the title is not it.
    const description =
        title === fileName ? artifactKindLabel(kind) : `${artifactKindLabel(kind)} · ${fileName}`;
    const body = (
        <>
            <ArtifactFileIcon kind={kind} />
            <ItemCard.Content>
                <ItemCard.Title>{title}</ItemCard.Title>
                <ItemCard.Description>{description}</ItemCard.Description>
            </ItemCard.Content>
        </>
    );

    if (!openArtifactPanel) {
        return (
            <ItemCard className={messageObjectCardClassName} variant="transparent">
                {body}
            </ItemCard>
        );
    }

    return (
        <ItemCard<'button'>
            className={messageObjectCardClassName}
            data-testid="artifact-card"
            render={(cardProps) => (
                <button
                    {...cardProps}
                    aria-label={`Open ${title}`}
                    onClick={() =>
                        openArtifactPanel({ kind: 'workspaceFile', path: props.path }, title)
                    }
                    type="button"
                />
            )}
            variant="transparent"
        >
            {body}
            <ItemCard.Action>
                <Icon aria-hidden className="size-4 text-muted" icon={ArrowRight01Icon} />
            </ItemCard.Action>
        </ItemCard>
    );
}
