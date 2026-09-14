import { Button, Card, Form } from '@heroui/react';
import * as React from 'react';
import { ActivationStep } from '../../components/activation/activation-shell.tsx';
import type { ServerSummary } from '../../lib/haus-server.tsx';
import { CreateServerFields, useCreateServerForm } from './create-server-form.tsx';
import { JoinServerFields, useJoinServerForm } from './join-server-form.tsx';
import { ServerSwitcher } from './server-switcher.tsx';

export type ServerChoiceView = 'servers' | 'create' | 'join';

/**
 * The activation Server chooser: one short screen per intent. The servers view
 * offers Create and Join; each flips to its own focused step with a way back.
 */
export function ServerChoiceFlow({
    initialView = 'servers',
    servers,
}: {
    initialView?: ServerChoiceView;
    servers: ServerSummary[];
}) {
    const [view, setView] = React.useState<ServerChoiceView>(initialView);
    const backToServers = () => setView('servers');

    if (view === 'create') {
        return <CreateServerStep onBack={backToServers} />;
    }
    if (view === 'join') {
        return <JoinServerStep onBack={backToServers} />;
    }
    return (
        <ServerChoiceStep
            onCreate={() => setView('create')}
            onJoin={() => setView('join')}
            servers={servers}
        />
    );
}

function ServerChoiceStep({
    onCreate,
    onJoin,
    servers,
}: {
    onCreate: () => void;
    onJoin: () => void;
    servers: ServerSummary[];
}) {
    const hasServers = servers.length > 0;

    return (
        <ActivationStep
            description={
                hasServers
                    ? 'Open a joined Server, or start another.'
                    : 'A Server is home base for you, your people, and your Agents. Create your own to get started, or join one with an invitation.'
            }
            footer={
                <>
                    <Button onPress={onJoin} variant="outline">
                        Join a Server
                    </Button>
                    <Button onPress={onCreate}>Create a Server</Button>
                </>
            }
            title={hasServers ? 'Choose a Server' : 'Welcome to Haus'}
        >
            {hasServers ? (
                <Card>
                    <Card.Content>
                        <ServerSwitcher servers={servers} />
                    </Card.Content>
                </Card>
            ) : null}
        </ActivationStep>
    );
}

function CreateServerStep({ onBack }: { onBack: () => void }) {
    const form = useCreateServerForm();

    return (
        <ActivationStep
            description="Start a new place for your people and Agents."
            footer={
                <>
                    <BackButton onPress={onBack} />
                    <Button
                        isDisabled={!form.isSubmittable}
                        isPending={form.isPending}
                        onPress={form.submit}
                    >
                        Create Server
                    </Button>
                </>
            }
            title="Create a Server"
        >
            <Form
                className="flex flex-col items-stretch"
                onSubmit={(event) => {
                    event.preventDefault();
                    form.submit();
                }}
            >
                <Card>
                    <Card.Content className="flex flex-col gap-4">
                        <CreateServerFields form={form} />
                    </Card.Content>
                </Card>
                <ImplicitSubmit />
            </Form>
        </ActivationStep>
    );
}

function JoinServerStep({ onBack }: { onBack: () => void }) {
    const form = useJoinServerForm();

    return (
        <ActivationStep
            description="Paste an invitation link or token."
            footer={
                <>
                    <BackButton onPress={onBack} />
                    <Button isDisabled={!form.isSubmittable} onPress={form.submit}>
                        Continue
                    </Button>
                </>
            }
            title="Join a Server"
        >
            <Form
                className="flex flex-col items-stretch"
                onSubmit={(event) => {
                    event.preventDefault();
                    form.submit();
                }}
            >
                <Card>
                    <Card.Content className="flex flex-col gap-4">
                        <JoinServerFields form={form} />
                    </Card.Content>
                </Card>
                <ImplicitSubmit />
            </Form>
        </ActivationStep>
    );
}

/**
 * Hidden native submit button: HeroUI buttons swallow the native click default,
 * so the visible action lives in the step footer via onPress while this keeps
 * Enter-in-field implicit submission working.
 */
function ImplicitSubmit() {
    return <button aria-hidden hidden tabIndex={-1} type="submit" />;
}

function BackButton({ onPress }: { onPress: () => void }) {
    return (
        <Button onPress={onPress} variant="ghost">
            Back
        </Button>
    );
}
