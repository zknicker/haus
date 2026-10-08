import { Autocomplete, EmptyState, Label, ListBox, SearchField, Separator } from '@heroui/react';
import { ItemCard } from '@heroui-pro/react';
import * as React from 'react';
import { useHumanTimezone } from '../../../hooks/members/use-human-timezone.ts';
import { matchesTimezoneSearch, timezoneOptions } from '../../../lib/timezones.ts';
import { SettingsRowTitle } from '../layout/settings-row-title.tsx';
import { SettingsRowError } from '../layout/settings-text.tsx';

/** The Timezone row's explanation, shared by the live and pending rows. */
export const timezoneInfo =
    'Agents schedule your daily and weekly reminders in this zone. Haus sets it from your device.';

/**
 * The human's timezone. It follows the Identity rows, so it brings its own
 * divider; the popover holds the search because there are hundreds of zones.
 */
export function TimezoneRow({
    serverId,
    timezone,
    userId,
}: {
    serverId: string;
    timezone: string | null;
    userId: string;
}) {
    const setTimezone = useHumanTimezone(serverId, userId);
    const options = React.useMemo(() => timezoneOptions(timezone), [timezone]);

    return (
        <>
            <Separator />
            <ItemCard>
                <ItemCard.Content>
                    <SettingsRowTitle info={timezoneInfo}>Timezone</SettingsRowTitle>
                    <SettingsRowError>{setTimezone.error?.message}</SettingsRowError>
                </ItemCard.Content>
                <ItemCard.Action>
                    <Autocomplete
                        aria-label="Timezone"
                        className="w-56 max-w-full"
                        isDisabled={setTimezone.isPending}
                        onChange={(key) => {
                            if (typeof key === 'string' && key !== timezone) {
                                void setTimezone.save(key).catch(() => undefined);
                            }
                        }}
                        placeholder="Not set"
                        value={timezone}
                        variant="secondary"
                    >
                        <Autocomplete.Trigger>
                            <Autocomplete.Value />
                            <Autocomplete.Indicator />
                        </Autocomplete.Trigger>
                        <Autocomplete.Popover>
                            <Autocomplete.Filter filter={matchesTimezoneSearch}>
                                <SearchField
                                    aria-label="Search timezones"
                                    autoFocus
                                    name="search"
                                    variant="secondary"
                                >
                                    <SearchField.Group>
                                        <SearchField.SearchIcon />
                                        <SearchField.Input placeholder="Search timezones" />
                                        <SearchField.ClearButton />
                                    </SearchField.Group>
                                </SearchField>
                                <ListBox
                                    renderEmptyState={() => (
                                        <EmptyState>No timezones match.</EmptyState>
                                    )}
                                >
                                    {options.map((option) => (
                                        <ListBox.Item
                                            id={option.id}
                                            key={option.id}
                                            textValue={option.label}
                                        >
                                            <Label>{option.label}</Label>
                                            <ListBox.ItemIndicator />
                                        </ListBox.Item>
                                    ))}
                                </ListBox>
                            </Autocomplete.Filter>
                        </Autocomplete.Popover>
                    </Autocomplete>
                </ItemCard.Action>
            </ItemCard>
        </>
    );
}
