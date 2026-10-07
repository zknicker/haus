import { Button, Label } from '@heroui/react';
import { EmojiPicker } from '@heroui-pro/react';
import { reactionEmojiCatalog } from '../chats/reactions/reaction-emoji-catalog.ts';
import { ProfileFieldInfo } from './profile-text-field.tsx';

/** What an Agent without a signature emoji reacts with when it picks up a message. */
export const DEFAULT_SIGNATURE_EMOJI = '👀';

/**
 * The Agent's signature emoji: one compact row in the Edit Profile editor and the New Agent
 * form. `null` means the Agent uses the default, which the trigger still shows so the row never
 * reads empty; Reset appears only once a custom emoji is chosen.
 *
 * The picker offers the reaction vocabulary. An emoji the Agent set for itself outside that
 * catalog still shows here, and stays until someone picks another or resets it.
 */
export function SignatureEmojiField({
    isDisabled,
    onChange,
    value,
}: {
    isDisabled?: boolean;
    onChange: (value: string | null) => void;
    value: string | null;
}) {
    const shown = value ?? DEFAULT_SIGNATURE_EMOJI;

    // Only the trigger and popover sit inside the picker: it is a Select, so it hands its
    // trigger props to every Button inside it, including the info and Reset buttons.
    return (
        <div className="flex min-h-7 items-center justify-between gap-2">
            <div className="flex items-center gap-0.5">
                <Label>Signature emoji</Label>
                <ProfileFieldInfo label="Signature emoji">
                    {`It reacts with this when it picks up a message. Defaults to ${DEFAULT_SIGNATURE_EMOJI}.`}
                </ProfileFieldInfo>
            </div>
            <div className="flex items-center gap-1">
                {value === null ? null : (
                    <Button
                        isDisabled={isDisabled}
                        onPress={() => onChange(null)}
                        size="sm"
                        variant="ghost"
                    >
                        Reset
                    </Button>
                )}
                <EmojiPicker
                    aria-label="Signature emoji"
                    isDisabled={isDisabled}
                    onSelectionChange={(key) => {
                        if (typeof key === 'string') {
                            onChange(key === DEFAULT_SIGNATURE_EMOJI ? null : key);
                        }
                    }}
                    selectedKey={shown}
                    size="sm"
                >
                    <EmojiPicker.Trigger
                        // The stock trigger ships unstyled by design; these documented HeroUI
                        // button classes give it the editor's secondary small-button shape.
                        className="button button--icon-only button--sm button--secondary text-base"
                    >
                        <EmojiPicker.Value>{() => shown}</EmojiPicker.Value>
                    </EmojiPicker.Trigger>
                    <EmojiPicker.Popover placement="bottom end">
                        <EmojiPicker.Content>
                            <EmojiPicker.Grid items={reactionEmojiCatalog}>
                                {(item) => (
                                    <EmojiPicker.Item id={item.emoji} textValue={item.name}>
                                        {item.emoji}
                                    </EmojiPicker.Item>
                                )}
                            </EmojiPicker.Grid>
                        </EmojiPicker.Content>
                    </EmojiPicker.Popover>
                </EmojiPicker>
            </div>
        </div>
    );
}
