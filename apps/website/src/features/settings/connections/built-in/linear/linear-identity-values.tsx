import { Avatar, Button, Chip, Separator, toast } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Fragment } from 'react';
import { CopyButton } from '../../../../../components/copy-button.tsx';
import type { LinearIdentityFlowValue } from './linear-identity-flow-model.ts';

/**
 * The values for Linear's new-app form, one row each: text with a copy
 * button, the webhook events to tick as plain labels, and the app icon to
 * save for Linear's upload field.
 */
export function LinearIdentityValues({ values }: { values: readonly LinearIdentityFlowValue[] }) {
    return (
        <ItemCardGroup className="w-full" variant="outline">
            {values.map((entry, index) => (
                <Fragment key={entry.label}>
                    {index > 0 ? <Separator /> : null}
                    <ValueRow entry={entry} />
                </Fragment>
            ))}
        </ItemCardGroup>
    );
}

function ValueRow({ entry }: { entry: LinearIdentityFlowValue }) {
    if (entry.kind === 'labels') {
        return (
            <ItemCard>
                <ItemCard.Content>
                    <ItemCard.Title>{entry.label}</ItemCard.Title>
                </ItemCard.Content>
                <ItemCard.Action className="flex flex-wrap justify-end gap-1.5">
                    {entry.values.map((value) => (
                        <Chip key={value} size="sm" variant="soft">
                            <Chip.Label>{value}</Chip.Label>
                        </Chip>
                    ))}
                </ItemCard.Action>
            </ItemCard>
        );
    }
    if (entry.kind === 'download') {
        // The icon itself is the value: its thumbnail sits where the other
        // rows show their text, and Linear's upload field takes the saved file.
        return (
            <ItemCard>
                <ItemCard.Content>
                    <ItemCard.Title>{entry.label}</ItemCard.Title>
                </ItemCard.Content>
                <ItemCard.Action className="flex items-center gap-2">
                    <Avatar aria-hidden="true" size="sm">
                        <Avatar.Image alt="" src={entry.url} />
                    </Avatar>
                    <Button onPress={() => void download(entry.url)} size="sm" variant="ghost">
                        Save image
                    </Button>
                </ItemCard.Action>
            </ItemCard>
        );
    }
    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>{entry.label}</ItemCard.Title>
                <ItemCard.Description className="max-w-full truncate font-mono" title={entry.value}>
                    {entry.value}
                </ItemCard.Description>
            </ItemCard.Content>
            <ItemCard.Action>
                <CopyButton label={`Copy ${entry.label}`} value={entry.value} />
            </ItemCard.Action>
        </ItemCard>
    );
}

/** Saves the icon as a file, since Linear's icon field takes an upload, not a URL. */
async function download(url: string) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`The image did not load (${response.status}).`);
        }
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = `app-icon.${blob.type.split('/')[1] ?? 'png'}`;
        link.click();
        URL.revokeObjectURL(objectUrl);
    } catch (error) {
        toast.danger('Could not save the image', {
            description: error instanceof Error ? error.message : 'Try again shortly.',
        });
    }
}
