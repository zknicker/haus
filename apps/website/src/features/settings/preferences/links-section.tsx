import { ItemCard } from '@heroui-pro/react';
import { Switch } from '@heroui/react';
import { type OpenLinksIn, setOpenLinksIn } from '../../../hooks/browser/open-links-preference.ts';

export function OpenLinksInRow({ value }: { value: OpenLinksIn }) {
    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>Open links in your browser</ItemCard.Title>
                <ItemCard.Description className="whitespace-normal">
                    Web links in chats and Haus pages open in your default browser.
                </ItemCard.Description>
            </ItemCard.Content>
            <ItemCard.Action>
                <Switch
                    aria-label="Open links in your browser"
                    isSelected={value === 'browser'}
                    onChange={applyOpenLinksInBrowser}
                >
                    <Switch.Content>
                        <Switch.Control>
                            <Switch.Thumb />
                        </Switch.Control>
                    </Switch.Content>
                </Switch>
            </ItemCard.Action>
        </ItemCard>
    );
}

export function applyOpenLinksInBrowser(inBrowser: boolean) {
    setOpenLinksIn(inBrowser ? 'browser' : 'haus');
}
