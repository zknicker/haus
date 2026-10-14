import type { CloudAgentCapabilityState } from '@haus/api';
import { Button, Modal, toast } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { useState } from 'react';
import { writeClipboardText } from '../../lib/clipboard.ts';
import { SettingsRowError } from '../settings/layout/settings-text.tsx';

type BootstrapSetup = NonNullable<CloudAgentCapabilityState['bootstrapSetup']>;

/** Only the clipboard receives the credential. It never enters a rendered input. */
export function ClaudeCloudSetupDialog({
    setup,
    computerId,
    ready,
    isChecking,
    onClose,
    onRecheck,
}: {
    setup: BootstrapSetup;
    computerId: string;
    ready: boolean;
    isChecking: boolean;
    onClose: () => void;
    onRecheck: () => void;
}) {
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const copyCredential = async () => {
        try {
            // The ordinary clipboard helper's DOM fallback would expose this credential.
            await navigator.clipboard.writeText(setup.token);
            setCopied(true);
            setError(null);
        } catch {
            setError('Clipboard access is unavailable. Enable it and try again.');
        }
    };
    const copyScript = () => {
        writeClipboardText(claudeCloudSetupScript(setup.serverOrigin))
            .then(() => toast.success('Setup script copied'))
            .catch(() => setError('Could not copy the setup script.'));
    };
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
            <Modal.Container size="md">
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    <Modal.Header>
                        <Modal.Heading>
                            {ready ? 'Claude Cloud ready' : 'Set up Claude Cloud'}
                        </Modal.Heading>
                    </Modal.Header>
                    <Modal.Body>
                        <ItemCardGroup>
                            <ItemCard>
                                <ItemCard.Content>
                                    <ItemCard.Title>
                                        1. Add a network secret in Claude
                                    </ItemCard.Title>
                                    <ItemCard.Description>
                                        In your Claude Cloud environment, add a Network secret for{' '}
                                        <code>{new URL(setup.serverOrigin).hostname}</code> with
                                        header <code>{setup.headerName}</code>. Paste the copied
                                        credential as its value and leave the header prefix empty.
                                        Limit its path prefix to <code>/api/cloud-agents/</code>. It
                                        grants access only to this Computer’s cloud handoff. Also
                                        add this host to Allowed domains so the environment setup
                                        script can download the hook before Claude starts.
                                    </ItemCard.Description>
                                </ItemCard.Content>
                                <ItemCard.Action>
                                    <Button onPress={copyCredential} size="sm" variant="secondary">
                                        {copied ? 'Credential copied' : 'Copy credential'}
                                    </Button>
                                </ItemCard.Action>
                            </ItemCard>
                            <ItemCard>
                                <ItemCard.Content>
                                    <ItemCard.Title>
                                        2. Add the environment setup script
                                    </ItemCard.Title>
                                    <ItemCard.Description>
                                        Paste the copied script into the same environment’s setup
                                        script. On this Computer, select that environment using
                                        Claude Code’s <code>/remote-env</code> command.
                                    </ItemCard.Description>
                                </ItemCard.Content>
                                <ItemCard.Action>
                                    <Button onPress={copyScript} size="sm" variant="secondary">
                                        Copy setup script
                                    </Button>
                                </ItemCard.Action>
                            </ItemCard>
                            <ItemCard>
                                <ItemCard.Content>
                                    <ItemCard.Title>3. Verify the environment</ItemCard.Title>
                                    <ItemCard.Description>
                                        Start a fresh session in that environment and send{' '}
                                        <code>HAUS_CLOUD_VERIFY {computerId}</code>. Then check the
                                        connection here. Haus marks it Ready after receiving the
                                        native hook verification.
                                    </ItemCard.Description>
                                </ItemCard.Content>
                            </ItemCard>
                        </ItemCardGroup>
                        <SettingsRowError>{error}</SettingsRowError>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button onPress={onClose} variant="secondary">
                            {ready ? 'Done' : 'Close'}
                        </Button>
                        {ready ? null : (
                            <Button isPending={isChecking} onPress={onRecheck}>
                                Check connection
                            </Button>
                        )}
                    </Modal.Footer>
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}

export function claudeCloudSetupScript(serverOrigin: string): string {
    const artifact = new URL('/api/cloud-agents/claude-hooks', serverOrigin).href;
    return `set -e
# Native callbacks use X-Haus-Cloud-Run; setup downloads only the nonsecret installer.
curl --fail --silent --show-error '${artifact}' --output /tmp/haus-cloud-hook.py
if [ "$(id -u)" -eq 0 ]; then
  python3 /tmp/haus-cloud-hook.py install '${new URL(serverOrigin).origin}'
else
  sudo python3 /tmp/haus-cloud-hook.py install '${new URL(serverOrigin).origin}'
fi`;
}
