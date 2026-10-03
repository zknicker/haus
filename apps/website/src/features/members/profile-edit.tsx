import { AGENT_PERSONALITY_MAX_LENGTH } from '@haus/api';
import { Button, Popover } from '@heroui/react';
import * as React from 'react';
import { ProfileTextField } from './profile-text-field.tsx';

/** The Agent-only personality field: still loading, or ready with its stored value. */
export type ProfilePersonality = { status: 'loading' } | { status: 'ready'; value: string };

export interface ProfileDraft {
    description: string;
    displayName: string;
    /** Present only when the editor offered the personality field. */
    personality?: string;
}

/**
 * One labeled Edit Profile action for the whole identity. Name and
 * description used to carry an icon pencil each, which read as orphaned
 * chrome; the identity mutation saves every field together anyway, so one
 * editor matches the contract instead of splitting it.
 *
 * An Agent's editor also carries its private personality, the one identity
 * field other participants never see; a human's does not.
 */
export function ProfileEdit({
    description,
    descriptionInfo,
    descriptionMaxLength,
    displayName,
    entityLabel,
    isDisabled,
    namePlaceholder,
    onSave,
    personality,
}: {
    description: string;
    descriptionInfo?: React.ReactNode;
    descriptionMaxLength: number;
    displayName: string;
    entityLabel: string;
    isDisabled?: boolean;
    namePlaceholder: string;
    onSave: (draft: ProfileDraft) => Promise<void>;
    personality?: ProfilePersonality;
}) {
    const storedPersonality = personality?.status === 'ready' ? personality.value : '';
    const [nameDraft, setNameDraft] = React.useState(displayName);
    const [descriptionDraft, setDescriptionDraft] = React.useState(description);
    const [personalityDraft, setPersonalityDraft] = React.useState(storedPersonality);
    const [open, setOpen] = React.useState(false);

    React.useEffect(() => {
        if (!open) {
            setNameDraft(displayName);
            setDescriptionDraft(description);
            setPersonalityDraft(storedPersonality);
        }
    }, [description, displayName, open, storedPersonality]);

    const personalityChanged =
        personality?.status === 'ready' && personalityDraft !== storedPersonality;
    const changed =
        nameDraft !== displayName || descriptionDraft !== description || personalityChanged;
    // A stored description that predates the cap may be resent unchanged; the Server allows it.
    const withinLimits =
        (descriptionDraft === description ||
            descriptionDraft.trim().length <= descriptionMaxLength) &&
        personalityDraft.trim().length <= AGENT_PERSONALITY_MAX_LENGTH;
    const canSave = changed && withinLimits && nameDraft.trim().length > 0 && !isDisabled;

    const save = async () => {
        if (!canSave) {
            return;
        }

        try {
            await onSave({
                description: descriptionDraft,
                displayName: nameDraft,
                ...(personalityChanged ? { personality: personalityDraft } : {}),
            });
            setOpen(false);
        } catch {
            // The mutation owns the error toast; keep the editor open for retry.
        }
    };

    return (
        <Popover isOpen={open} onOpenChange={setOpen}>
            <Button isDisabled={isDisabled} size="sm" variant="secondary">
                Edit Profile
            </Button>
            <Popover.Content className={personality ? 'w-96' : 'w-80'} placement="bottom">
                <Popover.Dialog className="grid gap-3 p-3">
                    <Popover.Heading>{entityLabel}</Popover.Heading>
                    <ProfileTextField
                        autoFocus
                        label="Name"
                        limit={{ kind: 'hard', max: 80 }}
                        onChange={setNameDraft}
                        onSubmit={() => void save()}
                        placeholder={namePlaceholder}
                        value={nameDraft}
                    />
                    <ProfileTextField
                        info={descriptionInfo}
                        label="Description"
                        limit={{ kind: 'counted', max: descriptionMaxLength }}
                        multiline={{ rows: 3 }}
                        onChange={setDescriptionDraft}
                        placeholder="No description yet."
                        value={descriptionDraft}
                    />
                    {personality ? (
                        <ProfileTextField
                            info="Private to this Agent: it shapes how it talks, not what it owns. Other Agents never see it. Applies from its next turn."
                            isDisabled={personality.status === 'loading'}
                            label="Personality"
                            limit={{ kind: 'counted', max: AGENT_PERSONALITY_MAX_LENGTH }}
                            multiline={{ rows: 4 }}
                            onChange={setPersonalityDraft}
                            placeholder="Terse. Plain words. Dry humor."
                            value={personalityDraft}
                        />
                    ) : null}
                    <div className="flex justify-end gap-2">
                        <Button onPress={() => setOpen(false)} size="sm" variant="ghost">
                            Cancel
                        </Button>
                        <Button
                            isDisabled={!canSave}
                            isPending={isDisabled}
                            onPress={() => void save()}
                            size="sm"
                        >
                            Save
                        </Button>
                    </div>
                </Popover.Dialog>
            </Popover.Content>
        </Popover>
    );
}
