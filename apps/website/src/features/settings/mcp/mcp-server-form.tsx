import {
    Button,
    Description,
    Disclosure,
    Drawer,
    Form,
    Input,
    Label,
    ListBox,
    Select,
    TextField,
} from '@heroui/react';
import type * as React from 'react';
import { useState } from 'react';
import { SecretFieldsEditor } from './mcp-secret-fields.tsx';
import {
    buildSaveInput,
    createConnectionDraft,
    type McpConnectionDraft,
    type McpConnectionSaveInput,
} from './mcp-server-shared.ts';

/** Footer actions live outside the form; they submit it by id. */
const MCP_CONNECTION_FORM_ID = 'mcp-connection-form';

export function McpConnectionFormDrawer({
    onOpenChange,
    onSave,
    open,
    saving,
}: {
    onOpenChange: (open: boolean) => void;
    onSave: (input: McpConnectionSaveInput) => void;
    open: boolean;
    saving: boolean;
}) {
    const [draft, setDraft] = useState(createConnectionDraft);
    const canSave = Boolean(draft.name.trim() && draft.url.trim());

    // Header, Body, and Footer are the dialog's own layout children — wrapping
    // them in the form collapsed that layout and floated the footer under the
    // fields instead of pinning it.
    return (
        <Drawer.Backdrop isDismissable isOpen={open} onOpenChange={onOpenChange}>
            <Drawer.Content placement="right">
                <Drawer.Dialog>
                    <Drawer.CloseTrigger />
                    <Drawer.Header>
                        <Drawer.Heading>Add MCP Server</Drawer.Heading>
                        <p className="mt-1.5 text-muted text-sm leading-5">
                            Point Haus at an MCP server, then authorize it if it asks for
                            credentials.
                        </p>
                    </Drawer.Header>
                    <Drawer.Body>
                        {/* A column, not a grid: grid items refuse to shrink
                            below their min-content, so one wide field would
                            widen every other field past the drawer. */}
                        <Form
                            className="flex flex-col gap-6"
                            id={MCP_CONNECTION_FORM_ID}
                            onSubmit={(event) => {
                                event.preventDefault();
                                if (canSave) {
                                    onSave(buildSaveInput(draft));
                                }
                            }}
                        >
                            <LabeledField
                                label="Name"
                                onChange={(name) => update(setDraft, { name })}
                                value={draft.name}
                            >
                                <Input placeholder="My MCP Server" />
                            </LabeledField>
                            <HttpConnectionFields draft={draft} setDraft={setDraft} />
                        </Form>
                    </Drawer.Body>
                    <Drawer.Footer>
                        <Button slot="close" type="button" variant="secondary">
                            Cancel
                        </Button>
                        <Button
                            form={MCP_CONNECTION_FORM_ID}
                            isDisabled={!canSave}
                            isPending={saving}
                            type="submit"
                        >
                            Add MCP
                        </Button>
                    </Drawer.Footer>
                </Drawer.Dialog>
            </Drawer.Content>
        </Drawer.Backdrop>
    );
}

function HttpConnectionFields({
    draft,
    setDraft,
}: {
    draft: McpConnectionDraft;
    setDraft: React.Dispatch<React.SetStateAction<McpConnectionDraft>>;
}) {
    return (
        <>
            {/* Trust is a property of the address, so the caveat rides with
                the field that names it rather than floating under the form. */}
            <LabeledField
                description="Only connect servers from developers you trust. Their tools and behavior can change."
                label="URL"
                onChange={(url) => update(setDraft, { url })}
                type="url"
                value={draft.url}
            >
                <Input placeholder="https://example.com/mcp" />
            </LabeledField>
            <Select
                fullWidth
                onChange={(value) =>
                    update(setDraft, {
                        auth:
                            value === 'oauth' ? 'oauth' : value === 'headers' ? 'headers' : 'none',
                    })
                }
                value={draft.auth}
                variant="secondary"
            >
                <Label>Authentication</Label>
                <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                    <ListBox>
                        <ListBox.Item id="none" textValue="None">
                            <Label>None</Label>
                            <ListBox.ItemIndicator />
                        </ListBox.Item>
                        <ListBox.Item id="oauth" textValue="OAuth">
                            <Label>OAuth</Label>
                            <ListBox.ItemIndicator />
                        </ListBox.Item>
                        <ListBox.Item id="headers" textValue="Secret Headers">
                            <Label>Secret Headers</Label>
                            <ListBox.ItemIndicator />
                        </ListBox.Item>
                    </ListBox>
                </Select.Popover>
            </Select>
            {draft.auth === 'headers' ? (
                <SecretFieldsEditor
                    addLabel="Add Header"
                    entries={draft.headers}
                    onChange={(headers) => update(setDraft, { headers })}
                    title="Secret Headers"
                />
            ) : null}
            {draft.auth === 'oauth' ? (
                <OAuthAdvancedFields draft={draft} setDraft={setDraft} />
            ) : null}
        </>
    );
}

function OAuthAdvancedFields({
    draft,
    setDraft,
}: {
    draft: McpConnectionDraft;
    setDraft: React.Dispatch<React.SetStateAction<McpConnectionDraft>>;
}) {
    return (
        <Disclosure>
            <Disclosure.Heading>
                <Button slot="trigger" variant="ghost">
                    Advanced OAuth Settings
                    <Disclosure.Indicator />
                </Button>
            </Disclosure.Heading>
            <Disclosure.Content>
                <Disclosure.Body>
                    <div className="grid gap-4">
                        <LabeledField
                            label="Client ID"
                            onChange={(oauthClientId) => update(setDraft, { oauthClientId })}
                            value={draft.oauthClientId}
                        >
                            <Input placeholder="Optional — dynamic registration is the default" />
                        </LabeledField>
                        <LabeledField
                            label="Client Secret"
                            onChange={(oauthClientSecret) =>
                                update(setDraft, { oauthClientSecret })
                            }
                            type="password"
                            value={draft.oauthClientSecret}
                        >
                            <Input placeholder="Optional" />
                        </LabeledField>
                        <LabeledField
                            label="Scopes"
                            onChange={(oauthScopes) => update(setDraft, { oauthScopes })}
                            value={draft.oauthScopes}
                        >
                            <Input placeholder="Space-separated, optional" />
                        </LabeledField>
                    </div>
                </Disclosure.Body>
            </Disclosure.Content>
        </Disclosure>
    );
}

function LabeledField({
    children,
    description,
    label,
    onChange,
    type = 'text',
    value,
}: {
    children: React.ReactNode;
    description?: string;
    label: string;
    onChange?: (value: string) => void;
    type?: 'password' | 'text' | 'url';
    value?: string;
}) {
    return (
        <TextField fullWidth onChange={onChange} type={type} value={value} variant="secondary">
            <Label>{label}</Label>
            {children}
            {description ? <Description>{description}</Description> : null}
        </TextField>
    );
}

function update(
    setDraft: React.Dispatch<React.SetStateAction<McpConnectionDraft>>,
    patch: Partial<McpConnectionDraft>
) {
    setDraft((current) => ({ ...current, ...patch }));
}
