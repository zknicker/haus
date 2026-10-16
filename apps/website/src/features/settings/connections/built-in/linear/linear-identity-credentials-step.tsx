import type { LinearIdentity } from '@haus/api';
import { Button, Form, Input, Label, TextField } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';
import { useLinearSaveIdentityCredentials } from '../../../../../hooks/linear/use-linear-save-identity-credentials.ts';
import { SettingsRowError } from '../../../layout/settings-text.tsx';
import {
    linearIdentityClientIdEditable,
    linearIdentityCredentialsInput,
} from './linear-identity-flow-model.ts';

/**
 * The two values Linear issues for the app, pasted back. Save stays off until
 * the pasted values can save. Reached from this window, the first field takes
 * focus; once the Owner has gone to Linear, focus waits until this window is
 * focused again, so it never pulls the keyboard out of Linear's tab beside it.
 */
export function LinearIdentityCredentialsStep({
    awaitingReturn,
    connectionId,
    identity,
    onSaved,
    serverId,
}: {
    /** The Owner opened Linear; focus the fields when this window is focused again. */
    awaitingReturn: boolean;
    connectionId: string;
    identity: LinearIdentity;
    onSaved: () => void;
    serverId: string;
}) {
    const autoFocus = !awaitingReturn;
    const save = useLinearSaveIdentityCredentials(serverId, connectionId);
    const [clientId, setClientId] = useState('');
    const [secret, setSecret] = useState('');
    const clientIdRef = useRef<HTMLInputElement>(null);
    const secretRef = useRef<HTMLInputElement>(null);
    const clientIdEditable = linearIdentityClientIdEditable(identity);
    const input = linearIdentityCredentialsInput(identity, {
        clientId,
        webhookSigningSecret: secret,
    });
    const placeholder = identity.credentialsSaved ? 'Saved' : undefined;

    useEffect(() => {
        if (!awaitingReturn) {
            return;
        }
        const focusFirstEmpty = () => {
            const target =
                clientIdEditable && !clientIdRef.current?.value ? clientIdRef : secretRef;
            target.current?.focus();
        };
        window.addEventListener('focus', focusFirstEmpty, { once: true });
        return () => window.removeEventListener('focus', focusFirstEmpty);
    }, [awaitingReturn, clientIdEditable]);

    const change = (next: { clientId: string; secret: string }) => {
        setClientId(next.clientId);
        setSecret(next.secret);
    };

    return (
        <Form
            className="flex w-full flex-col gap-4"
            onSubmit={(event) => {
                event.preventDefault();
                if (input) {
                    save.save({ ...input, identityId: identity.id }, () => {
                        change({ clientId: '', secret: '' });
                        onSaved();
                    });
                }
            }}
        >
            <TextField
                autoFocus={autoFocus && clientIdEditable}
                fullWidth
                isDisabled={save.isPending || !clientIdEditable}
                onChange={(value) => change({ clientId: value, secret })}
                value={clientId}
                variant="secondary"
            >
                <Label>Client ID</Label>
                <Input autoComplete="off" placeholder={placeholder} ref={clientIdRef} />
            </TextField>
            <TextField
                autoFocus={autoFocus && !clientIdEditable}
                fullWidth
                isDisabled={save.isPending}
                onChange={(value) => change({ clientId, secret: value })}
                type="password"
                value={secret}
                variant="secondary"
            >
                <Label>Webhook signing secret</Label>
                <Input autoComplete="off" placeholder={placeholder} ref={secretRef} />
            </TextField>
            <SettingsRowError>{save.error?.message}</SettingsRowError>
            <Button
                className="self-start"
                isDisabled={input === null}
                isPending={save.isPending}
                size="sm"
                type="submit"
            >
                Save
            </Button>
        </Form>
    );
}
