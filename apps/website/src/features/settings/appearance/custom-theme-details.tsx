import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Button, Input, Separator } from '@heroui/react';
import { useState } from 'react';
import { selectColorTheme } from '../../../hooks/shell/use-color-theme.ts';
import { deleteCustomTheme, updateCustomTheme } from '../../../hooks/shell/use-custom-themes.ts';
import { pruneUnusedBackgroundImages } from '../../../hooks/shell/use-theme-background.ts';
import type { CustomTheme } from '../../../lib/custom-themes.ts';

export function CustomThemeDetails({ theme }: { theme: CustomTheme }) {
    const [draft, setDraft] = useState(theme.name);
    const commitName = () => {
        const name = draft.trim().slice(0, 40);
        if (name && name !== theme.name) {
            updateCustomTheme(theme.id, (current) => ({ ...current, name }));
        }
        setDraft(name || theme.name);
    };
    const remove = () => {
        selectColorTheme('default');
        deleteCustomTheme(theme.id);
        void pruneUnusedBackgroundImages();
    };

    return (
        <ItemCardGroup className="overflow-hidden">
            <ItemCard>
                <ItemCard.Content>
                    <ItemCard.Title>Name</ItemCard.Title>
                </ItemCard.Content>
                <ItemCard.Action>
                    <Input
                        aria-label="Theme name"
                        className="w-48"
                        maxLength={40}
                        onBlur={commitName}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                commitName();
                            }
                        }}
                        value={draft}
                        variant="secondary"
                    />
                </ItemCard.Action>
            </ItemCard>
            <Separator />
            <ItemCard>
                <ItemCard.Content>
                    <ItemCard.Title>Delete theme</ItemCard.Title>
                </ItemCard.Content>
                <ItemCard.Action>
                    <Button onPress={remove} size="sm" variant="danger-soft">
                        Delete
                    </Button>
                </ItemCard.Action>
            </ItemCard>
        </ItemCardGroup>
    );
}
