import { AGENT_CONVERSATION_STYLE_MAX_LENGTH } from '@haus/api';
import { Button, Popover } from '@heroui/react';
import * as React from 'react';
import { ProfileTextField } from './profile-text-field.tsx';
import { SignatureEmojiField } from './signature-emoji-field.tsx';

/** The Agent-only voice fields: still loading, or ready with their stored values. */
export type ProfileAgentVoice =
    | { status: 'loading' }
    | { status: 'ready'; conversationStyle: string; signatureEmoji: string | null };

export interface ProfileDraft {
    description: string;
    displayName: string;
    /** Only the voice fields the editor changed; absent when none changed. */
    voice?: { conversationStyle?: string; signatureEmoji?: string | null };
}

/**
 * One labeled Edit Profile action for the whole identity. Name and
 * description used to carry an icon pencil each, which read as orphaned
 * chrome; the identity mutation saves every field together anyway, so one
 * editor matches the contract instead of splitting it.
 *
 * An Agent's editor also carries its private voice — conversation style and
 * signature emoji — which other participants never see; a human's does not.
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
    voice,
}: {
    description: string;
    descriptionInfo?: React.ReactNode;
    descriptionMaxLength: number;
    displayName: string;
    entityLabel: string;
    isDisabled?: boolean;
    namePlaceholder: string;
    onSave: (draft: ProfileDraft) => Promise<void>;
    voice?: ProfileAgentVoice;
}) {
    const storedStyle = voice?.status === 'ready' ? voice.conversationStyle : '';
    const storedEmoji = voice?.status === 'ready' ? voice.signatureEmoji : null;
    const [nameDraft, setNameDraft] = React.useState(displayName);
    const [descriptionDraft, setDescriptionDraft] = React.useState(description);
    // Voice edits stay undefined until touched, so a read that resolves after the editor
    // opens fills the fields instead of being saved over with blanks.
    const [styleEdit, setStyleDraft] = React.useState<string | undefined>();
    const [emojiEdit, setEmojiDraft] = React.useState<string | null | undefined>();
    const styleDraft = styleEdit ?? storedStyle;
    const emojiDraft = emojiEdit === undefined ? storedEmoji : emojiEdit;
    const [open, setOpen] = React.useState(false);

    React.useEffect(() => {
        if (!open) {
            setNameDraft(displayName);
            setDescriptionDraft(description);
            setStyleDraft(undefined);
            setEmojiDraft(undefined);
        }
    }, [description, displayName, open]);

    const voiceReady = voice?.status === 'ready';
    const styleChanged = voiceReady && styleDraft !== storedStyle;
    const emojiChanged = voiceReady && emojiDraft !== storedEmoji;
    const changed =
        nameDraft !== displayName ||
        descriptionDraft !== description ||
        styleChanged ||
        emojiChanged;
    // A stored description that predates the cap may be resent unchanged; the Server allows it.
    const withinLimits =
        (descriptionDraft === description ||
            descriptionDraft.trim().length <= descriptionMaxLength) &&
        styleDraft.trim().length <= AGENT_CONVERSATION_STYLE_MAX_LENGTH;
    const canSave = changed && withinLimits && nameDraft.trim().length > 0 && !isDisabled;

    const save = async () => {
        if (!canSave) {
            return;
        }

        try {
            await onSave({
                description: descriptionDraft,
                displayName: nameDraft,
                ...(styleChanged || emojiChanged
                    ? {
                          voice: {
                              ...(styleChanged ? { conversationStyle: styleDraft } : {}),
                              ...(emojiChanged ? { signatureEmoji: emojiDraft } : {}),
                          },
                      }
                    : {}),
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
            <Popover.Content className={voice ? 'w-96' : 'w-80'} placement="bottom">
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
                    {voice ? (
                        <>
                            <ProfileTextField
                                info="Adds a voice on top of the Agent's default personality. The Agent can also change this when you ask it to."
                                isDisabled={!voiceReady}
                                label="Conversation style"
                                limit={{
                                    kind: 'counted',
                                    max: AGENT_CONVERSATION_STYLE_MAX_LENGTH,
                                }}
                                multiline={{ rows: 4 }}
                                onChange={setStyleDraft}
                                placeholder="e.g. Dry and deadpan. Short replies, lowercase when it's casual. One emoji max."
                                value={styleDraft}
                            />
                            <SignatureEmojiField
                                isDisabled={!voiceReady}
                                onChange={setEmojiDraft}
                                value={emojiDraft}
                            />
                        </>
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
