import { Button, InputOTP, REGEXP_ONLY_DIGITS_AND_CHARS, Spinner } from '@heroui/react';
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { ActivationShell, ActivationStep } from '../../components/activation/activation-shell.tsx';
import { hausTrpc } from '../../lib/haus-server.tsx';

import { loginDescription, loginTitle } from './computer-login-copy.tsx';

const codeLength = 8;

/** The URL and wire format is `ABCD-EFGH`; slots hold the eight characters. */
function slotsFromCode(code: string): string {
    return code
        .replace(/[^a-zA-Z0-9]/gu, '')
        .toUpperCase()
        .slice(0, codeLength);
}

function codeFromSlots(slots: string): string {
    return slots.length === codeLength ? `${slots.slice(0, 4)}-${slots.slice(4)}` : '';
}

export type ComputerLoginStatus =
    | 'approved'
    | 'consumed'
    | 'denied'
    | 'expired'
    | 'malformed'
    | 'not-found'
    | 'pending';

export function ComputerLoginApproval({
    accountLabel,
    onSignIn,
    onSwitchAccount,
    signedIn,
}: {
    accountLabel: string | null;
    onSignIn: (() => void) | undefined;
    onSwitchAccount: (() => void) | undefined;
    signedIn: boolean;
}) {
    const [searchParams, setSearchParams] = useSearchParams();
    const codeFromUrl = slotsFromCode(searchParams.get('code') ?? '');
    const [slots, setSlots] = React.useState(codeFromUrl);
    const userCode = codeFromSlots(slots);
    const statusQuery = hausTrpc.computer.login.status.useQuery(
        { userCode },
        {
            enabled: userCode.length > 0,
            refetchInterval: (query) => (query.state.data?.status === 'approved' ? 1000 : false),
            // A login code's standing is only ever true at the moment it is
            // read, so this one opts below the app-wide staleness floor.
            staleTime: 0,
        }
    );
    const utils = hausTrpc.useUtils();
    const approve = hausTrpc.computer.login.approve.useMutation({
        onSuccess: (result, variables) => {
            utils.computer.login.status.setData({ userCode: variables.userCode }, result);
        },
    });
    const deny = hausTrpc.computer.login.deny.useMutation({
        onSuccess: (result, variables) => {
            utils.computer.login.status.setData({ userCode: variables.userCode }, result);
        },
    });

    React.useEffect(() => {
        setSlots(codeFromUrl);
    }, [codeFromUrl]);

    const status = statusQuery.data?.status;
    const setupFlow = Boolean(
        statusQuery.data && 'purpose' in statusQuery.data && statusQuery.data.purpose === 'setup'
    );
    const isWorking = approve.isPending || deny.isPending;
    const changeSlots = (next: string) => {
        approve.reset();
        deny.reset();
        setSlots(next.toUpperCase());
    };
    // A complete code becomes the shareable canonical URL; checking is automatic.
    const completeCode = (complete: string) => {
        setSearchParams({ code: codeFromSlots(complete.toUpperCase()) });
    };

    return (
        <LoginFrame
            description={loginDescription(status, signedIn)}
            footer={
                status === undefined ? (
                    // Checking is automatic on the eighth character; this anchor
                    // keeps the screen actionable while the code is incomplete.
                    <Button
                        isDisabled={slots.length < codeLength}
                        isPending={userCode.length > 0 && statusQuery.isPending}
                        onPress={() => void statusQuery.refetch()}
                    >
                        Check code
                    </Button>
                ) : (
                    <LoginActions
                        accountLabel={accountLabel}
                        isWorking={isWorking}
                        onApprove={() => approve.mutate({ userCode })}
                        onDeny={() => deny.mutate({ userCode })}
                        onSignIn={onSignIn}
                        onSwitchAccount={onSwitchAccount}
                        signedIn={signedIn}
                        status={status}
                    />
                )
            }
            title={loginTitle(status, setupFlow)}
        >
            {status !== 'consumed' ? (
                <div className="flex flex-col items-center gap-2">
                    <InputOTP
                        aria-label="Computer login code"
                        autoFocus={codeFromUrl.length === 0}
                        className="justify-center"
                        inputMode="text"
                        isDisabled={isWorking || status === 'approved'}
                        isInvalid={status === 'malformed'}
                        maxLength={codeLength}
                        onChange={changeSlots}
                        onComplete={completeCode}
                        pasteTransformer={slotsFromCode}
                        pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
                        value={slots}
                    >
                        <InputOTP.Group>
                            <InputOTP.Slot index={0} />
                            <InputOTP.Slot index={1} />
                            <InputOTP.Slot index={2} />
                            <InputOTP.Slot index={3} />
                        </InputOTP.Group>
                        <InputOTP.Separator />
                        <InputOTP.Group>
                            <InputOTP.Slot index={4} />
                            <InputOTP.Slot index={5} />
                            <InputOTP.Slot index={6} />
                            <InputOTP.Slot index={7} />
                        </InputOTP.Group>
                    </InputOTP>
                </div>
            ) : null}
            {statusQuery.error ? (
                <p className="text-center text-danger text-sm">{statusQuery.error.message}</p>
            ) : null}
            {approve.error || deny.error ? (
                <p className="text-center text-danger text-sm">
                    {(approve.error ?? deny.error)?.message}
                </p>
            ) : null}
        </LoginFrame>
    );
}

function LoginActions({
    accountLabel,
    isWorking,
    onApprove,
    onDeny,
    onSignIn,
    onSwitchAccount,
    signedIn,
    status,
}: {
    accountLabel: string | null;
    isWorking: boolean;
    onApprove: () => void;
    onDeny: () => void;
    onSignIn: (() => void) | undefined;
    onSwitchAccount: (() => void) | undefined;
    signedIn: boolean;
    status: ComputerLoginStatus | undefined;
}) {
    if (status === 'consumed') {
        return (
            <Button onPress={() => window.close()} variant="secondary">
                Close this page
            </Button>
        );
    }
    if (status === 'approved') {
        return <Spinner aria-label="Finishing Computer login" size="sm" />;
    }
    if (status !== 'pending') {
        return null;
    }
    if (!signedIn) {
        return onSignIn ? <Button onPress={onSignIn}>Sign in to approve</Button> : null;
    }

    return (
        <div className="flex w-full flex-col gap-6">
            <div className="flex flex-col items-center gap-1">
                <p className="text-center text-muted text-sm">
                    Signed in as{' '}
                    <span className="font-medium text-foreground">
                        {accountLabel ?? 'your active account'}
                    </span>
                </p>
                {onSwitchAccount ? (
                    <Button isDisabled={isWorking} onPress={onSwitchAccount} variant="ghost">
                        Use another account
                    </Button>
                ) : null}
            </div>
            <div className="flex flex-wrap justify-center gap-2">
                <Button isPending={isWorking} onPress={onApprove}>
                    Approve Haus Computer
                </Button>
                <Button isDisabled={isWorking} onPress={onDeny} variant="secondary">
                    Deny
                </Button>
            </div>
        </div>
    );
}

export function LoginFrame({
    children,
    description,
    footer,
    title,
}: {
    children?: React.ReactNode;
    description: React.ReactNode;
    footer?: React.ReactNode;
    title: string;
}) {
    return (
        <ActivationShell>
            <ActivationStep description={description} footer={footer} title={title}>
                {children}
            </ActivationStep>
        </ActivationShell>
    );
}
