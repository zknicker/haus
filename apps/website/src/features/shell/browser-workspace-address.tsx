import { ComboBox, Description, Input, Label, ListBox } from '@heroui/react';
import type { BrowserHistoryEntry } from '../../hooks/browser/use-browser-history.ts';

export function BrowserWorkspaceAddress({
    address,
    history,
    onChange,
    onFocus,
    onBlur,
    onNavigate,
    autoFocus,
}: {
    address: string;
    history: BrowserHistoryEntry[];
    onChange: (value: string) => void;
    onFocus: () => void;
    onBlur: () => void;
    onNavigate: (url: string) => void;
    autoFocus: boolean;
}) {
    const query = address.toLowerCase();
    const suggestions = history
        .filter((entry) => `${entry.title} ${entry.url}`.toLowerCase().includes(query))
        .slice(0, 8);
    return (
        <ComboBox
            allowsCustomValue
            className="browser-address min-w-0 flex-1"
            inputValue={address}
            items={suggestions}
            menuTrigger="input"
            onInputChange={onChange}
            onSelectionChange={(key) => {
                if (typeof key === 'string') {
                    onChange(key);
                    onNavigate(key);
                }
            }}
            selectedKey={suggestions.some((entry) => entry.url === address) ? address : null}
        >
            <Label className="sr-only">Page address</Label>
            <ComboBox.InputGroup>
                <Input
                    autoFocus={autoFocus}
                    id="browser-address"
                    onBlur={onBlur}
                    onFocus={(event) => {
                        onFocus();
                        event.currentTarget.select();
                    }}
                    onKeyDown={(event) => {
                        if (
                            event.key === 'Enter' &&
                            !event.nativeEvent.isComposing &&
                            !event.currentTarget.getAttribute('aria-activedescendant')
                        ) {
                            event.preventDefault();
                            if (address.trim()) {
                                onNavigate(address.trim());
                            }
                        }
                    }}
                    placeholder="Search or enter a URL"
                />
                <ComboBox.Trigger />
            </ComboBox.InputGroup>
            <ComboBox.Popover>
                <ListBox items={suggestions}>
                    {(entry) => (
                        <ListBox.Item id={entry.url} textValue={entry.url}>
                            <Label>{entry.title}</Label>
                            <Description>{entry.url}</Description>
                        </ListBox.Item>
                    )}
                </ListBox>
            </ComboBox.Popover>
        </ComboBox>
    );
}
