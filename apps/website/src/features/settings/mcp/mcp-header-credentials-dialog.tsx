import { Button, Form, Modal } from '@heroui/react';
import { Key01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { useState } from 'react';
import { Icon } from '../../../components/ui/icon.tsx';
import { SecretFieldsEditor } from './mcp-secret-fields.tsx';
import {
    createSecretDraftEntry,
    type McpConnection,
    type SecretDraftEntry,
    toSecretRecord,
} from './mcp-server-shared.ts';

export function McpHeaderCredentialsDialog({
    connection,
    onOpenChange,
    onSave,
    open,
    saving,
}: {
    connection: McpConnection;
    onOpenChange: (open: boolean) => void;
    onSave: (headers: Record<string, string>) => Promise<void>;
    open: boolean;
    saving: boolean;
}) {
    return (
        <Modal.Backdrop isDismissable isOpen={open} onOpenChange={onOpenChange}>
            <Modal.Container size="md">
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    {open ? (
                        <HeaderCredentialsForm
                            connection={connection}
                            onCancel={() => onOpenChange(false)}
                            onSave={onSave}
                            saving={saving}
                        />
                    ) : null}
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}

function HeaderCredentialsForm({
    connection,
    onCancel,
    onSave,
    saving,
}: {
    connection: McpConnection;
    onCancel: () => void;
    onSave: (headers: Record<string, string>) => Promise<void>;
    saving: boolean;
}) {
    const [headers, setHeaders] = useState<SecretDraftEntry[]>(() =>
        connection.headerNames.length > 0
            ? connection.headerNames.map((name) => ({
                  ...createSecretDraftEntry(),
                  name,
              }))
            : [createSecretDraftEntry()]
    );
    const values = toSecretRecord(headers);
    const canSave =
        Object.keys(values).length > 0 &&
        headers.every((entry) => entry.name.trim().length === 0 || entry.value.length > 0);

    return (
        <>
            <Modal.Header>
                <Modal.Icon className="bg-default text-foreground">
                    <Icon className="size-5" icon={Key01Icon} />
                </Modal.Icon>
                <Modal.Heading>Connect {connection.name}</Modal.Heading>
                <p className="mt-1.5 text-muted text-sm leading-5">
                    Enter the request headers this server uses to authenticate.
                </p>
            </Modal.Header>
            <Modal.Body>
                <Form
                    id="mcp-header-credentials-form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (canSave) {
                            void onSave(values).catch(() => undefined);
                        }
                    }}
                >
                    {/* Saved values never come back from the Server, so the
                        caveat belongs to the fields it constrains. */}
                    <SecretFieldsEditor
                        addLabel="Add Header"
                        description="Existing values are never shown. Re-enter every header you want to keep."
                        entries={headers}
                        onChange={setHeaders}
                        title="Headers"
                    />
                </Form>
            </Modal.Body>
            <Modal.Footer>
                <Button onPress={onCancel} slot="close" type="button" variant="secondary">
                    Cancel
                </Button>
                <Button
                    form="mcp-header-credentials-form"
                    isDisabled={!canSave}
                    isPending={saving}
                    type="submit"
                >
                    Save Credentials
                </Button>
            </Modal.Footer>
        </>
    );
}
