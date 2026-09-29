import { avatarGenerationConceptMaxLength } from '@haus/api/avatar-generation';
import { Button, Form, InputGroup, Modal, Spinner, TextField, Tooltip } from '@heroui/react';
import { AiMagicIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../../components/ui/icon.tsx';
import {
    type AvatarGenerationSession,
    isGenerating,
    stagedVariant,
} from './avatar-generation-session.ts';
import { AvatarGenerationStage } from './avatar-generation-stage.tsx';

export interface AvatarGenerationDialogProps {
    currentAvatarUrl: string | null;
    name: string;
    onConceptChange: (concept: string) => void;
    onGenerate: () => void;
    onOpenChange: (open: boolean) => void;
    onSave: () => void;
    onStage: (slot: string) => void;
    open: boolean;
    session: AvatarGenerationSession;
}

/** Presentational generation flow: one paged stage, prompt bar, explicit save. */
export function AvatarGenerationDialog({
    currentAvatarUrl,
    name,
    onConceptChange,
    onGenerate,
    onOpenChange,
    onSave,
    onStage,
    open,
    session,
}: AvatarGenerationDialogProps) {
    return (
        // Only a save in flight holds the dialog open; a run in flight keeps
        // going with the dialog closed and lands as a new page.
        <Modal.Backdrop
            isDismissable={!session.saving}
            isKeyboardDismissDisabled={session.saving}
            isOpen={open}
            onOpenChange={onOpenChange}
        >
            <Modal.Container size="sm">
                <Modal.Dialog>
                    <Modal.CloseTrigger isDisabled={session.saving} />
                    <Modal.Header>
                        <Modal.Heading>Generate Avatar</Modal.Heading>
                        <p className="text-muted text-sm leading-5">
                            Describe a character and get a pixel-art portrait. Try a few; nothing
                            changes until you use one.
                        </p>
                    </Modal.Header>
                    {/* Every region below has a fixed box, so no state — first
                        variant, a run, an error, a pending save — resizes the
                        dialog. Errors render inside their own reserved slots. */}
                    <Modal.Body className="grid gap-4">
                        <AvatarGenerationStage
                            currentAvatarUrl={currentAvatarUrl}
                            name={name}
                            onStage={onStage}
                            session={session}
                        />
                        <AvatarConceptBar
                            onConceptChange={onConceptChange}
                            onGenerate={onGenerate}
                            session={session}
                        />
                    </Modal.Body>
                    <Modal.Footer>
                        <p
                            className="line-clamp-2 min-w-0 flex-1 text-danger text-xs leading-4"
                            role="alert"
                            title={session.saveError ?? undefined}
                        >
                            {session.saveError}
                        </p>
                        <Button isDisabled={session.saving} slot="close" variant="tertiary">
                            Cancel
                        </Button>
                        <Button
                            isDisabled={!stagedVariant(session)}
                            isPending={session.saving}
                            onPress={onSave}
                        >
                            {({ isPending }) => (
                                // The label keeps its box while the spinner
                                // sits over it, so a pending save never
                                // resizes the button.
                                <span className="grid place-items-center">
                                    <span
                                        className={`col-start-1 row-start-1 ${isPending ? 'invisible' : ''}`}
                                    >
                                        Use Avatar
                                    </span>
                                    {isPending ? (
                                        <span className="col-start-1 row-start-1 flex">
                                            <Spinner color="current" size="sm" />
                                        </span>
                                    ) : null}
                                </span>
                            )}
                        </Button>
                    </Modal.Footer>
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}

/**
 * The concept is a prompt bar: Enter or the sparkle submits, and once a
 * variant exists the same control draws another. A blank concept leaves the
 * submit disabled, which also blocks Enter's implicit submission.
 */
export function AvatarConceptBar({
    onConceptChange,
    onGenerate,
    session,
}: Pick<AvatarGenerationDialogProps, 'onConceptChange' | 'onGenerate' | 'session'>) {
    const generating = isGenerating(session);
    const canGenerate = session.concept.trim().length > 0 && !generating && !session.saving;
    const action = session.variants.length > 0 ? 'Generate another' : 'Generate';

    return (
        <Form
            onSubmit={(event) => {
                event.preventDefault();
                if (canGenerate) {
                    onGenerate();
                }
            }}
        >
            <TextField
                aria-label="Avatar concept"
                fullWidth
                onChange={onConceptChange}
                value={session.concept}
            >
                <InputGroup fullWidth variant="secondary">
                    <InputGroup.Input
                        autoFocus
                        maxLength={avatarGenerationConceptMaxLength}
                        placeholder="A moonlit fox cartographer"
                    />
                    <InputGroup.Suffix>
                        <Tooltip delay={0}>
                            <Button
                                aria-label={action}
                                isDisabled={!canGenerate}
                                isIconOnly
                                isPending={generating}
                                size="sm"
                                type="submit"
                                variant={session.variants.length > 0 ? 'secondary' : 'primary'}
                            >
                                {({ isPending }) =>
                                    isPending ? (
                                        <Spinner color="current" size="sm" />
                                    ) : (
                                        <Icon className="size-4" icon={AiMagicIcon} />
                                    )
                                }
                            </Button>
                            <Tooltip.Content placement="top">{action}</Tooltip.Content>
                        </Tooltip>
                    </InputGroup.Suffix>
                </InputGroup>
            </TextField>
        </Form>
    );
}
