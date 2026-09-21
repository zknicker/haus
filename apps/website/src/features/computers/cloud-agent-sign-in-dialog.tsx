import { Button, Modal, Separator, Spinner } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Key01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { useState } from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { writeClipboardText } from '../../lib/clipboard.ts';
import { openExternalLink } from '../../lib/open-external-link.ts';
import { SettingsRowError } from '../settings/layout/settings-text.tsx';

import type { CloudAgentSignInView } from './cloud-agent-sign-in-model.ts';

export function CloudAgentSignInDialog({
    computerName,
    view,
    isCancelling,
    error,
    onClose,
    onCancel,
    onRetry,
}: {
    computerName: string;
    view: CloudAgentSignInView;
    isCancelling: boolean;
    error: string | null;
    onClose: () => void;
    onCancel: () => void;
    onRetry: () => void;
}) {
    const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
    const [linkError, setLinkError] = useState<string | null>(null);
    const copyLink = async (url: string) => {
        try {
            await writeClipboardText(url);
            setCopiedUrl(url);
            setLinkError(null);
        } catch {
            setLinkError('Could not copy the link. Use Continue in Cursor to sign in.');
        }
    };
    const openLink = async (url: string) => {
        try {
            await openExternalLink(url);
            setLinkError(null);
        } catch {
            setLinkError(
                'Could not open your browser. Copy the sign-in link and open it yourself.'
            );
        }
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
            <Modal.Container size="sm">
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    <Modal.Header>
                        <Modal.Icon className="bg-default text-foreground">
                            <Icon className="size-5" icon={Key01Icon} />
                        </Modal.Icon>
                        <Modal.Heading>
                            {view.status === 'connected' ? 'Cursor connected' : 'Sign in to Cursor'}
                        </Modal.Heading>
                        <p className="mt-1.5 text-muted text-sm leading-5">
                            {view.status === 'connected'
                                ? `${computerName} can now start Cloud Agents.`
                                : `Sign in with your browser to connect ${computerName}.`}
                        </p>
                    </Modal.Header>
                    <Modal.Body>
                        <ItemCardGroup className="overflow-hidden">
                            <ItemCard>
                                <ItemCard.Content>
                                    <ItemCard.Title aria-live="polite">
                                        {statusTitle(view)}
                                    </ItemCard.Title>
                                    <ItemCard.Description>
                                        {statusDescription(view)}
                                    </ItemCard.Description>
                                </ItemCard.Content>
                                {view.status === 'starting' || view.status === 'waiting' ? (
                                    <ItemCard.Action>
                                        <Spinner size="sm" />
                                    </ItemCard.Action>
                                ) : null}
                            </ItemCard>
                            {view.status === 'waiting' ? (
                                <>
                                    <Separator />
                                    <ItemCard>
                                        <ItemCard.Content>
                                            <ItemCard.Title>Use another browser</ItemCard.Title>
                                        </ItemCard.Content>
                                        <ItemCard.Action>
                                            <Button
                                                onPress={() => {
                                                    void copyLink(view.url);
                                                }}
                                                size="sm"
                                                variant="secondary"
                                            >
                                                {copiedUrl === view.url
                                                    ? 'Link copied'
                                                    : 'Copy sign-in link'}
                                            </Button>
                                        </ItemCard.Action>
                                    </ItemCard>
                                </>
                            ) : null}
                        </ItemCardGroup>
                        <SettingsRowError>
                            {view.status === 'failed' || view.status === 'offline'
                                ? view.message
                                : (error ?? (view.status === 'waiting' ? linkError : null))}
                        </SettingsRowError>
                    </Modal.Body>
                    <Modal.Footer>
                        <SignInActions
                            isCancelling={isCancelling}
                            onCancel={onCancel}
                            onClose={onClose}
                            onOpen={openLink}
                            onRetry={onRetry}
                            view={view}
                        />
                    </Modal.Footer>
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}

function SignInActions({
    view,
    isCancelling,
    onCancel,
    onClose,
    onRetry,
    onOpen,
}: {
    view: CloudAgentSignInView;
    isCancelling: boolean;
    onCancel: () => void;
    onClose: () => void;
    onRetry: () => void;
    onOpen: (url: string) => Promise<void>;
}) {
    switch (view.status) {
        case 'connected':
            return <Button onPress={onClose}>Done</Button>;
        case 'offline':
            return (
                <Button onPress={onClose} variant="secondary">
                    Close
                </Button>
            );
        case 'failed':
            return (
                <>
                    <Button onPress={onClose} variant="secondary">
                        Close
                    </Button>
                    <Button onPress={onRetry}>Try again</Button>
                </>
            );
        case 'starting':
            return (
                <Button onPress={onClose} variant="secondary">
                    Close
                </Button>
            );
        case 'waiting':
            return (
                <>
                    <Button isPending={isCancelling} onPress={onCancel} variant="secondary">
                        Cancel sign-in
                    </Button>
                    <Button
                        isDisabled={isCancelling}
                        onPress={() => {
                            void onOpen(view.url);
                        }}
                    >
                        Continue in Cursor
                    </Button>
                </>
            );
    }
}

function statusTitle(view: CloudAgentSignInView): string {
    switch (view.status) {
        case 'starting':
            return 'Preparing your sign-in link…';
        case 'waiting':
            return 'Waiting for you to sign in';
        case 'connected':
            return 'Ready for Cloud Agents';
        case 'failed':
            return 'Sign-in incomplete';
        case 'offline':
            return 'Computer offline';
    }
}

function statusDescription(view: CloudAgentSignInView): string {
    switch (view.status) {
        case 'starting':
            return 'This usually takes a moment.';
        case 'waiting':
            return 'Haus will finish connecting for you.';
        case 'connected':
            return view.email
                ? `Connected as ${view.email}.`
                : 'This Computer can now start Cloud Agents.';
        case 'failed':
            return 'Try again for a new sign-in link.';
        case 'offline':
            return 'Your Computer needs to reconnect.';
    }
}
