import type { OnePasswordVault } from '@haus/api';
import { Button, Label, ListBox, Modal, Spinner } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Key01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { useState } from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import type { OnePasswordConnectStep } from '../../hooks/servers/use-onepassword-connect.ts';
import { SettingsRowError } from '../settings/layout/settings-text.tsx';

/**
 * Connect 1Password: approve in 1Password, pick one vault, approve the new
 * read-only service account. Each approval happens in the 1Password app.
 */
export function SecretsConnectDialog({
    computerName,
    onClose,
    onConnect,
    onRetry,
    state,
}: {
    computerName: string;
    onClose: () => void;
    onConnect: (account: string, vault: OnePasswordVault) => void;
    onRetry: () => void;
    state: OnePasswordConnectStep;
}) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const vaults = state.step === 'choosing' ? state.vaults : [];
    const selected = vaults.find((vault) => vault.id === selectedId) ?? null;

    return (
        <Modal.Backdrop
            isDismissable
            isOpen
            onOpenChange={(open) => {
                if (!open) {
                    onClose();
                }
            }}
        >
            <Modal.Container size="sm">
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    <Modal.Header>
                        <Modal.Icon className="bg-default text-foreground">
                            <Icon className="size-5" icon={Key01Icon} />
                        </Modal.Icon>
                        <Modal.Heading>Connect 1Password</Modal.Heading>
                        <p className="mt-1.5 text-muted text-sm leading-5">
                            Every Agent on {computerName} gets read-only access to one vault.
                        </p>
                    </Modal.Header>
                    <Modal.Body>
                        {state.step === 'choosing' ? (
                            <ListBox
                                aria-label="Vault"
                                items={vaults}
                                onSelectionChange={(keys) => {
                                    const [key] = keys === 'all' ? [] : [...keys];
                                    setSelectedId(typeof key === 'string' ? key : null);
                                }}
                                selectedKeys={selectedId ? [selectedId] : []}
                                selectionMode="single"
                            >
                                {(vault) => (
                                    <ListBox.Item id={vault.id} textValue={vault.name}>
                                        <Label>{vault.name}</Label>
                                        <ListBox.ItemIndicator />
                                    </ListBox.Item>
                                )}
                            </ListBox>
                        ) : (
                            <ItemCardGroup className="overflow-hidden">
                                <ItemCard>
                                    <ItemCard.Content>
                                        <ItemCard.Title aria-live="polite">
                                            {stepTitle(state)}
                                        </ItemCard.Title>
                                        <ItemCard.Description>
                                            {stepDescription(state)}
                                        </ItemCard.Description>
                                    </ItemCard.Content>
                                    {state.step === 'approving' || state.step === 'creating' ? (
                                        <ItemCard.Action>
                                            <Spinner size="sm" />
                                        </ItemCard.Action>
                                    ) : null}
                                </ItemCard>
                            </ItemCardGroup>
                        )}
                        <SettingsRowError>
                            {state.step === 'failed' ? state.message : null}
                        </SettingsRowError>
                    </Modal.Body>
                    <Modal.Footer>
                        {state.step === 'choosing' ? (
                            <>
                                <Button onPress={onClose} variant="secondary">
                                    Cancel
                                </Button>
                                <Button
                                    isDisabled={!selected}
                                    onPress={() => {
                                        if (selected) {
                                            onConnect(state.account, selected);
                                        }
                                    }}
                                >
                                    Connect vault
                                </Button>
                            </>
                        ) : state.step === 'failed' ? (
                            <>
                                <Button onPress={onClose} variant="secondary">
                                    Close
                                </Button>
                                <Button onPress={onRetry}>Try again</Button>
                            </>
                        ) : state.step === 'connected' ? (
                            <Button onPress={onClose}>Done</Button>
                        ) : (
                            <Button onPress={onClose} variant="secondary">
                                Close
                            </Button>
                        )}
                    </Modal.Footer>
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}

function stepTitle(state: OnePasswordConnectStep): string {
    switch (state.step) {
        case 'idle':
        case 'approving':
            return 'Waiting for 1Password';
        case 'creating':
            return `Creating access to “${state.vault.name}”`;
        case 'connected':
            return state.status.connected
                ? `Connected to “${state.status.vault.name}”`
                : 'Connected';
        case 'failed':
            return 'Could not connect';
        case 'choosing':
            return 'Choose a vault';
    }
}

function stepDescription(state: OnePasswordConnectStep): string {
    switch (state.step) {
        case 'idle':
        case 'approving':
            return 'Approve the request in the 1Password app.';
        case 'creating':
            return 'Approve listing its items, then the new read-only service account, in 1Password. Setting up the Computer can take a minute.';
        case 'connected':
            return 'Agents run commands with these secrets through haus-secrets.';
        case 'failed':
            return 'Nothing was saved on this Computer.';
        case 'choosing':
            return '';
    }
}
