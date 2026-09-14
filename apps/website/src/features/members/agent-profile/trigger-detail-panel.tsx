import { type Agent, type Trigger, triggerTitleMaxLength } from '@haus/api';
import { Button, FieldError, Form, Input, Label, TextArea, TextField } from '@heroui/react';
import { Sheet } from '@heroui-pro/react';
import * as React from 'react';
import { useTriggerDelete } from '../../../hooks/members/use-trigger-delete.ts';
import { useTriggerRotate } from '../../../hooks/members/use-trigger-rotate.ts';
import { useTriggerRuns } from '../../../hooks/members/use-trigger-runs.ts';
import { useTriggerTestFire } from '../../../hooks/members/use-trigger-test-fire.ts';
import { useTriggerUpdate } from '../../../hooks/members/use-trigger-update.ts';
import { SettingsRowError } from '../../settings/layout/settings-text.tsx';
import {
    canSaveTriggerEdit,
    canTestTrigger,
    triggerEditPatch,
    triggerInstructionIssue,
    triggerKindOption,
    triggerTitleIssue,
} from './agent-trigger-model.ts';
import { TriggerConfirmDialog } from './trigger-confirm-dialog.tsx';
import { TriggerFireHistory } from './trigger-fire-history.tsx';
import { TriggerManageGroup } from './trigger-manage-group.tsx';
import { TriggerSummaryGroup } from './trigger-summary-group.tsx';
import { type TriggerMintedSecret, TriggerWebhookCard } from './trigger-webhook-card.tsx';
import { TriggerWhenToRun } from './trigger-when-to-run.tsx';

/** Footer actions live outside the form; they submit it by id. */
const TRIGGER_DETAIL_FORM_ID = 'trigger-detail-form';

/**
 * One Trigger, opened from its row or landed on straight after creating it.
 * The heading says what it is in one plain sentence and every fact about it —
 * kind, author, activity — reads as a row below, so the sentence never has to
 * be rewritten to carry one more. A secret minted in this session is pinned
 * above all of that, because it is the one thing that cannot be read again.
 */
export function TriggerDetailPanel({
    agent,
    onClose,
    onRotated,
    secret,
    serverId,
    trigger,
}: {
    agent: Agent;
    onClose: () => void;
    onRotated: (secret: TriggerMintedSecret) => void;
    secret: TriggerMintedSecret | null;
    serverId: string;
    trigger: Trigger;
}) {
    const update = useTriggerUpdate(serverId, agent.id);
    const rotate = useTriggerRotate(serverId, agent.id);
    const remove = useTriggerDelete(serverId, agent.id);
    const testFire = useTriggerTestFire(serverId, agent.id, trigger.id);
    const runs = useTriggerRuns(serverId, trigger.id, true);
    const [draft, setDraft] = React.useState({
        instruction: trigger.instruction ?? '',
        title: trigger.title,
    });
    const [confirm, setConfirm] = React.useState<'delete' | 'rotate' | null>(null);

    const titleIssue = triggerTitleIssue(draft.title);
    const instructionIssue = triggerInstructionIssue(draft.instruction);
    const canSave = canSaveTriggerEdit(draft, trigger) && !update.isPending;
    const error = update.error?.message ?? rotate.error?.message ?? remove.error?.message ?? null;

    return (
        <>
            <Sheet.Header>
                <Sheet.Heading>{trigger.title}</Sheet.Heading>
                <p className="mt-1.5 text-muted text-sm leading-5">
                    {`Wake ${agent.displayName} when something outside Haus happens.`}
                </p>
            </Sheet.Header>
            <Sheet.Body>
                {/* A single auto track is sized by its widest row's min-content,
                    and the URL row's is one unbreakable token — so every group
                    in the drawer would stretch to it and overflow the sheet.
                    Pinning the track to the body's width lets that one row
                    truncate instead. */}
                <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
                    {secret ? <TriggerWebhookCard secret={secret} /> : null}
                    <Form
                        className="grid gap-6"
                        id={TRIGGER_DETAIL_FORM_ID}
                        onSubmit={(event) => {
                            event.preventDefault();
                            const patch = triggerEditPatch(draft, trigger);
                            if (!(canSave && patch)) {
                                return;
                            }
                            void update.update(trigger.id, patch).catch(() => undefined);
                        }}
                    >
                        <TextField
                            fullWidth
                            isDisabled={update.isPending}
                            isInvalid={Boolean(titleIssue)}
                            onChange={(title) => setDraft((current) => ({ ...current, title }))}
                            value={draft.title}
                            variant="secondary"
                        >
                            <Label>Name</Label>
                            <Input maxLength={triggerTitleMaxLength} />
                            {titleIssue ? <FieldError>{titleIssue}</FieldError> : null}
                        </TextField>
                        <TextField
                            fullWidth
                            isDisabled={update.isPending}
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
                    </Form>
                    <TriggerSummaryGroup
                        agentId={agent.id}
                        ownerName={agent.displayName}
                        serverId={serverId}
                        trigger={trigger}
                    />
                    <TriggerWhenToRun kind={triggerKindOption(trigger.kind)} url={trigger.url} />
                    <TriggerManageGroup
                        canTest={canTestTrigger(trigger)}
                        isRotating={rotate.isPending}
                        isTesting={testFire.isPending}
                        onRotate={() => setConfirm('rotate')}
                        onTest={() => void testFire.testFire()}
                    />
                    <TriggerFireHistory fires={runs.data} isPending={runs.isPending} />
                    {/* A failed save or delete belongs with the drawer's own
                        actions, as text — a boxed Alert here would outweigh
                        every row it sits under. */}
                    <SettingsRowError>{error}</SettingsRowError>
                </div>
            </Sheet.Body>
            <Sheet.Footer>
                <Button
                    isDisabled={remove.isPending}
                    onPress={() => setConfirm('delete')}
                    type="button"
                    variant="danger-soft"
                >
                    Delete
                </Button>
                <Button
                    isDisabled={update.isPending}
                    onPress={onClose}
                    type="button"
                    variant="secondary"
                >
                    Close
                </Button>
                <Button
                    form={TRIGGER_DETAIL_FORM_ID}
                    isDisabled={!canSave}
                    isPending={update.isPending}
                    type="submit"
                >
                    Save
                </Button>
            </Sheet.Footer>
            <TriggerConfirmDialog
                body="The current secret stops working immediately. Anything still using it needs the new one."
                confirmLabel="Rotate Secret"
                heading={`Rotate the secret for ${trigger.title}?`}
                isOpen={confirm === 'rotate'}
                isPending={rotate.isPending}
                onConfirm={() => {
                    void rotate
                        .rotate(trigger.id)
                        .then((result) => {
                            onRotated({
                                curl: result.curl,
                                minted: 'rotated',
                                secret: result.secret,
                                triggerId: trigger.id,
                                url: result.url,
                            });
                            setConfirm(null);
                        })
                        .catch(() => setConfirm(null));
                }}
                onOpenChange={(open) => !open && setConfirm(null)}
            />
            <TriggerConfirmDialog
                body="This removes the trigger immediately. Recent fire history stays in Agent history for 30 days, and messages already posted keep their provenance mark."
                confirmLabel="Delete Trigger"
                heading={`Delete ${trigger.title}?`}
                isOpen={confirm === 'delete'}
                isPending={remove.isPending}
                onConfirm={() => {
                    void remove
                        .deleteTrigger(trigger.id)
                        .then(() => {
                            setConfirm(null);
                            onClose();
                        })
                        .catch(() => setConfirm(null));
                }}
                onOpenChange={(open) => !open && setConfirm(null)}
                status="danger"
            />
        </>
    );
}
