import { AlertDialog, Button, Input, Label, TextField } from '@heroui/react';
import * as React from 'react';
import { SettingsRowError } from '../../features/settings/layout/settings-text.tsx';

export function DeleteDialog({
    confirmation,
    description,
    error,
    onConfirm,
    onOpenChange,
    pending,
    title,
}: {
    confirmation: string;
    description: string;
    error?: string;
    onConfirm(): void;
    onOpenChange(open: boolean): void;
    pending: boolean;
    title: string;
}) {
    const [typed, setTyped] = React.useState('');

    return (
        <AlertDialog isOpen onOpenChange={onOpenChange}>
            <AlertDialog.Backdrop isDismissable>
                <AlertDialog.Container size="sm">
                    <AlertDialog.Dialog>
                        <AlertDialog.Header>
                            <AlertDialog.Icon status="danger" />
                            <AlertDialog.Heading>{title}</AlertDialog.Heading>
                        </AlertDialog.Header>
                        <AlertDialog.Body>
                            <div className="grid gap-4">
                                <p>{description}</p>
                                <TextField
                                    autoComplete="off"
                                    fullWidth
                                    onChange={setTyped}
                                    value={typed}
                                    variant="secondary"
                                >
                                    <Label>
                                        Type <strong>{confirmation}</strong> to confirm
                                    </Label>
                                    <Input />
                                </TextField>
                                <SettingsRowError>{error}</SettingsRowError>
                            </div>
                        </AlertDialog.Body>
                        <AlertDialog.Footer>
                            <Button slot="close" type="button" variant="secondary">
                                Cancel
                            </Button>
                            <Button
                                isDisabled={typed !== confirmation}
                                isPending={pending}
                                onPress={onConfirm}
                                type="button"
                                variant="danger"
                            >
                                {title}
                            </Button>
                        </AlertDialog.Footer>
                    </AlertDialog.Dialog>
                </AlertDialog.Container>
            </AlertDialog.Backdrop>
        </AlertDialog>
    );
}
