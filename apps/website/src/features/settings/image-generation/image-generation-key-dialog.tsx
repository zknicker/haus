import { type ImageGenerationProvider, imageGenerationProviderKeySchema } from '@haus/api';
import { Button, FieldError, Form, Input, Label, Modal, TextField } from '@heroui/react';
import { useState } from 'react';
import { providerNames } from './image-generation-settings-model.ts';

const FORM_ID = 'image-generation-key-form';

/**
 * One secret field for a provider's API key. The Server never returns a stored
 * key, so the field always starts empty: replacing means pasting the key again.
 */
export function ImageGenerationKeyDialog({
    onOpenChange,
    onSave,
    open,
    provider,
    replacing,
}: {
    onOpenChange: (open: boolean) => void;
    onSave: (apiKey: string) => Promise<void>;
    open: boolean;
    provider: ImageGenerationProvider;
    replacing: boolean;
}) {
    return (
        <Modal.Backdrop isDismissable isOpen={open} onOpenChange={onOpenChange}>
            <Modal.Container size="md">
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    {open ? (
                        <KeyForm
                            onCancel={() => onOpenChange(false)}
                            onSave={onSave}
                            provider={provider}
                            replacing={replacing}
                        />
                    ) : null}
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}

function KeyForm({
    onCancel,
    onSave,
    provider,
    replacing,
}: {
    onCancel: () => void;
    onSave: (apiKey: string) => Promise<void>;
    provider: ImageGenerationProvider;
    replacing: boolean;
}) {
    const name = providerNames[provider];
    const [key, setKey] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const submit = async () => {
        const parsed = imageGenerationProviderKeySchema.safeParse(key);
        if (!parsed.success) {
            setError('Paste the full API key.');
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await onSave(parsed.data);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Haus could not save this key.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <Modal.Header>
                <Modal.Heading>{`${replacing ? 'Replace' : 'Add'} ${name} key`}</Modal.Heading>
                <p className="mt-1.5 text-muted text-sm leading-5">
                    Agents on this Server generate images with your own {name} account.
                </p>
            </Modal.Header>
            <Modal.Body>
                <Form
                    className="flex flex-col gap-3"
                    id={FORM_ID}
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (key.trim().length > 0 && !saving) {
                            void submit();
                        }
                    }}
                >
                    <TextField
                        autoFocus
                        fullWidth
                        isInvalid={error !== null}
                        onChange={(value) => {
                            setKey(value);
                            setError(null);
                        }}
                        type="password"
                        value={key}
                        variant="secondary"
                    >
                        <Label>API key</Label>
                        <Input autoComplete="off" />
                        <FieldError>{error}</FieldError>
                    </TextField>
                </Form>
            </Modal.Body>
            <Modal.Footer>
                <Button onPress={onCancel} slot="close" type="button" variant="secondary">
                    Cancel
                </Button>
                <Button
                    form={FORM_ID}
                    isDisabled={key.trim().length === 0}
                    isPending={saving}
                    type="submit"
                >
                    Save Key
                </Button>
            </Modal.Footer>
        </>
    );
}
