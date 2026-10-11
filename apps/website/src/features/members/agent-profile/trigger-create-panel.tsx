import { type Agent, type Trigger, triggerTitleMaxLength } from '@haus/api';
import { Alert, Button, FieldError, Form, Input, Label, TextArea, TextField } from '@heroui/react';
import { Sheet } from '@heroui-pro/react';
import * as React from 'react';
import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { useServerGithubInstallations } from '../../../hooks/github/use-server-github-installations.ts';
import { useTriggerCreate } from '../../../hooks/members/use-trigger-create.ts';
import {
    canCreateTrigger,
    refusalText,
    type TriggerDraft,
    triggerInstructionIssue,
    triggerKindOptions,
    triggerTitleIssue,
} from './agent-trigger-model.ts';
import { TriggerGithubFields } from './trigger-github-fields.tsx';
import {
    createGithubTriggerDraft,
    type GithubTriggerDraft,
    githubConfigFromDraft,
    githubInstallationOptions,
} from './trigger-github-model.ts';
import { TriggerKindPicker } from './trigger-kind-picker.tsx';
import type { TriggerMintedSecret } from './trigger-webhook-card.tsx';

/** Footer actions live outside the form; they submit it by id. */
const TRIGGER_CREATE_FORM_ID = 'trigger-create-form';

/**
 * Authoring a Trigger in the order a person thinks about one: what to call it,
 * what the Agent should do, then what wakes it. A webhook hands the drawer the
 * secret that came with it; a GitHub Trigger has none.
 */
export function TriggerCreatePanel({
    agent,
    onCancel,
    onCreated,
    serverId,
}: {
    agent: Agent;
    onCancel: () => void;
    onCreated: (trigger: Trigger, secret: TriggerMintedSecret | null) => void;
    serverId: string;
}) {
    const create = useTriggerCreate(serverId, agent.id);
    const installations = useServerGithubInstallations(serverId);
    // The access cache ages out over hours; a minute's resolution is plenty.
    const now = useRelativeNow(60_000);
    const options = installations.data
        ? githubInstallationOptions(installations.data, { agentId: agent.id, now })
        : [];
    const [draft, setDraft] = React.useState<TriggerDraft>({
        instruction: '',
        kind: null,
        title: '',
    });
    const [github, setGithub] = React.useState<GithubTriggerDraft | null>(null);

    const titleIssue = triggerTitleIssue(draft.title);
    const instructionIssue = triggerInstructionIssue(draft.instruction);
    // An installation that lost its sign-in or grant after it was picked stops the submit.
    const githubConfig =
        github &&
        options.some(
            (option) => option.installation.id === github.installationId && option.blocker === null
        )
            ? githubConfigFromDraft(github)
            : null;
    const canSubmit =
        canCreateTrigger(draft) &&
        (draft.kind !== 'github' || githubConfig !== null) &&
        !create.isPending;

    const submit = () => {
        const instruction = draft.instruction.trim();
        const shared = { title: draft.title.trim(), ...(instruction ? { instruction } : {}) };
        if (draft.kind === 'github' && githubConfig) {
            void create
                .createGithub({ ...shared, github: githubConfig })
                .then((trigger) => onCreated(trigger, null))
                .catch(() => undefined);
        } else if (draft.kind === 'webhook') {
            void create
                .create({ ...shared, kind: 'webhook' })
                .then((result) =>
                    onCreated(result.trigger, {
                        curl: result.curl,
                        minted: 'created',
                        secret: result.secret,
                        triggerId: result.trigger.id,
                        url: result.url,
                    })
                )
                .catch(() => undefined);
        }
    };

    return (
        <>
            <Sheet.Header>
                <Sheet.Heading>New trigger</Sheet.Heading>
                <p className="mt-1.5 text-muted text-sm leading-5">
                    Wake {agent.displayName} when something outside Haus happens.
                </p>
            </Sheet.Header>
            <Sheet.Body>
                <Form
                    className="grid gap-6"
                    id={TRIGGER_CREATE_FORM_ID}
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (canSubmit) {
                            submit();
                        }
                    }}
                >
                    <TextField
                        fullWidth
                        isDisabled={create.isPending}
                        isInvalid={Boolean(titleIssue)}
                        onChange={(title) => setDraft((current) => ({ ...current, title }))}
                        value={draft.title}
                        variant="secondary"
                    >
                        <Label>Name</Label>
                        <Input
                            autoFocus
                            maxLength={triggerTitleMaxLength}
                            placeholder="Deploy finished"
                        />
                        {titleIssue ? <FieldError>{titleIssue}</FieldError> : null}
                    </TextField>
                    <TextField
                        fullWidth
                        isDisabled={create.isPending}
                        isInvalid={Boolean(instructionIssue)}
                        onChange={(instruction) =>
                            setDraft((current) => ({ ...current, instruction }))
                        }
                        value={draft.instruction}
                        variant="secondary"
                    >
                        <Label>Instruction</Label>
                        <TextArea
                            placeholder={`What should ${agent.displayName} do each time it fires?`}
                            rows={4}
                        />
                        {instructionIssue ? <FieldError>{instructionIssue}</FieldError> : null}
                    </TextField>
                    <TriggerKindPicker
                        disabledReasons={
                            installations.data && !installations.error && options.length === 0
                                ? { github: 'Connect GitHub first' }
                                : {}
                        }
                        isDisabled={create.isPending}
                        kinds={triggerKindOptions}
                        onChange={(kind) => {
                            setDraft((current) => ({ ...current, kind }));
                            if (kind === 'github' && !github) {
                                setGithub(createGithubTriggerDraft(options));
                            }
                        }}
                        value={draft.kind}
                    />
                    {draft.kind === 'github' && github ? (
                        <TriggerGithubFields
                            agentName={agent.displayName}
                            draft={github}
                            isDisabled={create.isPending}
                            loadError={
                                installations.error
                                    ? `Some GitHub installations could not be loaded. ${refusalText(installations.error.message)}`
                                    : null
                            }
                            onChange={setGithub}
                            options={options}
                            serverId={serverId}
                        />
                    ) : null}
                    {create.error ? (
                        <Alert role="alert" status="danger">
                            <Alert.Indicator />
                            <Alert.Content>
                                <Alert.Description>
                                    {refusalText(create.error.message)}
                                </Alert.Description>
                            </Alert.Content>
                        </Alert>
                    ) : null}
                </Form>
            </Sheet.Body>
            <Sheet.Footer>
                <Button
                    isDisabled={create.isPending}
                    onPress={onCancel}
                    type="button"
                    variant="secondary"
                >
                    Cancel
                </Button>
                <Button
                    form={TRIGGER_CREATE_FORM_ID}
                    isDisabled={!canSubmit}
                    isPending={create.isPending}
                    type="submit"
                >
                    Create
                </Button>
            </Sheet.Footer>
        </>
    );
}
