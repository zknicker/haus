import {
    avatarGenerationConceptMaxLength,
    type GeneratedAvatar,
} from '@haus/api/avatar-generation';
import { Button, FieldError, Form, Input, Label, Modal, Skeleton, TextField } from '@heroui/react';
import { AiMagicIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../../components/ui/icon.tsx';
import { SettingsRowError } from '../../settings/layout/settings-text.tsx';

const avatarGenerationFormId = 'agent-avatar-generation-form';

export interface AvatarGenerationDialogProps {
    concept: string;
    conceptError?: string | null;
    error: string | null;
    isGenerating: boolean;
    isSaving: boolean;
    name: string;
    onConceptChange: (concept: string) => void;
    onGenerate: () => void;
    onOpenChange: (open: boolean) => void;
    onSave: () => void;
    open: boolean;
    preview: GeneratedAvatar | null;
}

/** Presentational generation flow: concept, one preview, explicit save/cancel. */
export function AvatarGenerationDialog({
    concept,
    conceptError = null,
    error,
    isGenerating,
    isSaving,
    name,
    onConceptChange,
    onGenerate,
    onOpenChange,
    onSave,
    open,
    preview,
}: AvatarGenerationDialogProps) {
    const busy = isGenerating || isSaving;

    return (
        <Modal.Backdrop isDismissable={!busy} isOpen={open} onOpenChange={onOpenChange}>
            <Modal.Container size="md">
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    <Modal.Header>
                        {/* Modal.Icon carries no background of its own;
                            the stock idiom pairs it with a soft fill. */}
                        <Modal.Icon className="bg-accent-soft text-accent-soft-foreground">
                            <Icon className="size-5" icon={AiMagicIcon} />
                        </Modal.Icon>
                        <Modal.Heading>Generate Avatar</Modal.Heading>
                        <p className="mt-1.5 text-muted text-sm leading-5">
                            Describe a short concept for one preview. The Agent's name and
                            description are not used.
                        </p>
                    </Modal.Header>
                    <Modal.Body>
                        <AvatarGenerationFields
                            concept={concept}
                            conceptError={conceptError}
                            error={error}
                            isGenerating={isGenerating}
                            name={name}
                            onConceptChange={onConceptChange}
                            onGenerate={onGenerate}
                            preview={preview}
                        />
                    </Modal.Body>
                    <Modal.Footer>
                        <AvatarGenerationActions
                            busy={busy}
                            concept={concept}
                            error={error}
                            isGenerating={isGenerating}
                            isSaving={isSaving}
                            onSave={onSave}
                            preview={preview}
                        />
                    </Modal.Footer>
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}

export function AvatarGenerationFields({
    concept,
    conceptError = null,
    error,
    isGenerating,
    name,
    onConceptChange,
    onGenerate,
    preview,
}: Pick<
    AvatarGenerationDialogProps,
    | 'concept'
    | 'conceptError'
    | 'error'
    | 'isGenerating'
    | 'name'
    | 'onConceptChange'
    | 'onGenerate'
    | 'preview'
>) {
    return (
        <Form
            className="grid gap-4"
            id={avatarGenerationFormId}
            onSubmit={(event) => {
                event.preventDefault();
                onGenerate();
            }}
        >
            <TextField
                fullWidth
                isInvalid={Boolean(conceptError)}
                isRequired
                onChange={onConceptChange}
                value={concept}
                variant="secondary"
            >
                <Label>Concept</Label>
                <Input
                    autoFocus
                    maxLength={avatarGenerationConceptMaxLength}
                    placeholder="e.g. a moonlit fox cartographer"
                />
                {conceptError ? <FieldError>{conceptError}</FieldError> : null}
            </TextField>
            {/* The stage exists only once there is something to stage: an
                empty placeholder box read as a drop zone it never was. */}
            {isGenerating || preview ? (
                <div className="flex h-56 items-center justify-center rounded-2xl bg-surface-secondary">
                    {isGenerating ? (
                        <Skeleton
                            aria-label="Generating avatar preview"
                            className="size-40 rounded-2xl"
                        />
                    ) : preview ? (
                        <img
                            alt={`${name} generated avatar preview`}
                            className="size-40 rounded-2xl"
                            height={256}
                            src={avatarPreviewSource(preview)}
                            width={256}
                        />
                    ) : null}
                </div>
            ) : null}
            <SettingsRowError>{error}</SettingsRowError>
        </Form>
    );
}

export function AvatarGenerationActions({
    busy,
    concept,
    error,
    isGenerating,
    isSaving,
    onSave,
    preview,
}: Pick<
    AvatarGenerationDialogProps,
    'concept' | 'error' | 'isGenerating' | 'isSaving' | 'onSave' | 'preview'
> & { busy: boolean }) {
    return (
        <>
            <Button isDisabled={busy} slot="close" type="button" variant="secondary">
                Cancel
            </Button>
            {/* Generate leads until a preview exists, then hands primary to
                Save — no permanently disabled primary action. */}
            <Button
                form={avatarGenerationFormId}
                isDisabled={busy || concept.trim().length === 0}
                isPending={isGenerating}
                type="submit"
                variant={preview ? 'secondary' : 'primary'}
            >
                {error ? 'Try Again' : preview ? 'Generate Another' : 'Generate Preview'}
            </Button>
            {preview ? (
                <Button isDisabled={busy} isPending={isSaving} onPress={onSave} type="button">
                    Save Avatar
                </Button>
            ) : null}
        </>
    );
}

function avatarPreviewSource(preview: GeneratedAvatar) {
    return `data:${preview.mediaType};base64,${preview.bytesBase64}`;
}
