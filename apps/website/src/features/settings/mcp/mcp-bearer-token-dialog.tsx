import { type McpBearerTokenPreset, mcpBearerTokenSchema, mcpPresetIcons } from '@haus/api';
import {
    Button,
    FieldError,
    Form,
    Input,
    Label,
    Link,
    Modal,
    TextField,
    toast,
} from '@heroui/react';
import { useState } from 'react';
import { openSystemBrowserLink } from '../../../lib/open-external-link.ts';
import { ConnectionGlyph } from './connection-mark.tsx';

const FORM_ID = 'mcp-bearer-token-form';

/** What a Server Owner needs to know before pasting a preset's token. */
const tokenGuides: Record<
    McpBearerTokenPreset,
    { name: string; portalLabel: string; portalUrl: string; summary: string }
> = {
    x: {
        name: 'X',
        portalLabel: 'Get a Bearer token from the X Developer Portal',
        portalUrl: 'https://developer.x.com',
        summary: "Searches and reads public posts using your X developer app's credits.",
    },
};

/**
 * One secret field for a bearer-token preset. Server wraps the token into the
 * request header itself and never sends it back, so the field always starts
 * empty — replacing means pasting the token again.
 */
export function McpBearerTokenDialog({
    heading,
    onOpenChange,
    onSave,
    open,
    preset,
}: {
    heading: string;
    onOpenChange: (open: boolean) => void;
    onSave: (bearerToken: string) => Promise<void>;
    open: boolean;
    preset: McpBearerTokenPreset;
}) {
    return (
        <Modal.Backdrop isDismissable isOpen={open} onOpenChange={onOpenChange}>
            <Modal.Container size="md">
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    {open ? (
                        <BearerTokenForm
                            heading={heading}
                            onCancel={() => onOpenChange(false)}
                            onSave={onSave}
                            preset={preset}
                        />
                    ) : null}
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}

function BearerTokenForm({
    heading,
    onCancel,
    onSave,
    preset,
}: {
    heading: string;
    onCancel: () => void;
    onSave: (bearerToken: string) => Promise<void>;
    preset: McpBearerTokenPreset;
}) {
    const guide = tokenGuides[preset];
    const [token, setToken] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const canSave = token.trim().length > 0 && !saving;

    const submit = async () => {
        // The contract's own check, so a pasted "Bearer …" or stray space is
        // explained here instead of coming back as a raw validation error.
        const parsed = mcpBearerTokenSchema.safeParse(token);
        if (!parsed.success) {
            setError(parsed.error.issues[0]?.message ?? 'Enter a valid token.');
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await onSave(parsed.data);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Haus could not save this token.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <Modal.Header>
                <Modal.Icon className="overflow-hidden bg-default text-foreground">
                    <ConnectionGlyph
                        connection={{ icon: mcpPresetIcons[preset], id: preset, name: guide.name }}
                    />
                </Modal.Icon>
                <Modal.Heading>{heading}</Modal.Heading>
                <p className="mt-1.5 text-muted text-sm leading-5">{guide.summary}</p>
            </Modal.Header>
            <Modal.Body>
                <Form
                    className="flex flex-col gap-3"
                    id={FORM_ID}
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (canSave) {
                            void submit();
                        }
                    }}
                >
                    <TextField
                        autoFocus
                        fullWidth
                        isInvalid={error !== null}
                        onChange={(value) => {
                            setToken(value);
                            setError(null);
                        }}
                        type="password"
                        value={token}
                        variant="secondary"
                    >
                        <Label>Bearer token</Label>
                        <Input autoComplete="off" />
                        <FieldError>{error}</FieldError>
                    </TextField>
                    {/* System browser: the portal needs the human's own X session, and the
                        dialog stays open for the token they bring back. */}
                    <Link
                        onPress={() => {
                            openSystemBrowserLink(guide.portalUrl).catch(() =>
                                toast.danger(`Could not open the ${guide.name} Developer Portal`)
                            );
                        }}
                    >
                        {guide.portalLabel}
                        <Link.Icon />
                    </Link>
                </Form>
            </Modal.Body>
            <Modal.Footer>
                <Button onPress={onCancel} slot="close" type="button" variant="secondary">
                    Cancel
                </Button>
                <Button
                    form={FORM_ID}
                    isDisabled={token.trim().length === 0}
                    isPending={saving}
                    type="submit"
                >
                    Save Token
                </Button>
            </Modal.Footer>
        </>
    );
}
