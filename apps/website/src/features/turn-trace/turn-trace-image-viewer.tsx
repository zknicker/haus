import { Button, Modal } from '@heroui/react';
import type * as React from 'react';
import { useDesktopPageOpeners } from '../../hooks/desktop-tabs/use-desktop-page-openers.ts';
import { TurnTraceProse } from './turn-trace-blocks.tsx';
import type { TurnTraceWorkspace } from './turn-trace-scope.tsx';
import type { TurnTraceImage } from './turn-trace-tool-model.ts';

/**
 * A generated image's in-trace preview as the trigger for the image at the
 * window's size: its file name, the image, the prompt behind it, and, where
 * the App opens Agent files as pages (desktop), a way into the workspace. The
 * trace has no Artifact Panel to hand the file to, so this is the narrowest
 * stock overlay: a HeroUI Modal, which opens on Enter or Space, closes on
 * Escape, and returns focus to the preview.
 */
export function TurnTraceImageViewer({
    children,
    image,
    path,
    src,
    workspace,
}: {
    children: React.ReactNode;
    image: TurnTraceImage;
    path: string;
    src: string;
    workspace: TurnTraceWorkspace;
}) {
    const name = image.file?.name ?? path;
    const openArtifact = useDesktopPageOpeners()?.openArtifact;
    const openInWorkspace = openArtifact
        ? () => openArtifact({ agentId: workspace.agentId, kind: 'workspaceFile', path }, name)
        : null;

    return (
        <Modal>
            <Modal.Trigger aria-label={`View ${name}`}>{children}</Modal.Trigger>
            <Modal.Backdrop>
                <Modal.Container>
                    {/* Wider than stock sizes, so the image reads at the
                        window's measure (`default-theme.css`). */}
                    <Modal.Dialog className="modal__dialog--image">
                        {({ close }) => (
                            <TurnTraceImageViewerContent
                                image={image}
                                name={name}
                                onOpenInWorkspace={
                                    openInWorkspace
                                        ? () => {
                                              openInWorkspace();
                                              close();
                                          }
                                        : null
                                }
                                src={src}
                            />
                        )}
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
}

/** The dialog's contents, split from the overlay so their shape can be proved directly. */
export function TurnTraceImageViewerContent({
    image,
    name,
    onOpenInWorkspace,
    src,
}: {
    image: TurnTraceImage;
    name: string;
    /** Null where the App has no page for an Agent's file (the web). */
    onOpenInWorkspace: (() => void) | null;
    src: string;
}) {
    return (
        <>
            <Modal.CloseTrigger />
            <Modal.Header>
                <Modal.Heading className="truncate">{name}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="grid justify-items-center gap-3">
                <img
                    alt={image.prompt ?? name}
                    className="h-auto max-h-[70vh] w-auto max-w-full rounded-md object-contain"
                    // As in the preview: the attributes only seed the aspect ratio.
                    height={1024}
                    src={src}
                    width={1024}
                />
                {image.prompt ? (
                    <div className="w-full">
                        <TurnTraceProse text={image.prompt} />
                    </div>
                ) : null}
            </Modal.Body>
            {onOpenInWorkspace ? (
                <Modal.Footer>
                    <Button onPress={onOpenInWorkspace} variant="secondary">
                        Open in workspace
                    </Button>
                </Modal.Footer>
            ) : null}
        </>
    );
}
