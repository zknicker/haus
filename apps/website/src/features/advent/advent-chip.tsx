import { adventDoorCount } from '@haus/api';
import { Chip } from '@heroui/react';
import * as React from 'react';
import { Button } from 'react-aria-components';
import { useColorThemeDefinition } from '../../hooks/shell/use-color-theme.ts';
import { useServerContext } from '../servers/server-context.ts';
import { AdventCalendarDialog } from './advent-calendar-dialog.tsx';
import { type AdventSeason, adventSeason, doorColor, isTodayUnopened } from './advent-season.ts';
import { doorArt, nicheArt } from './door-art.ts';
import { useLocalToday } from './local-today.ts';
import { useOpenedDays } from './use-opened-days.ts';

/**
 * The advent calendar's way in: a small chip after the Inbox date, in the
 * greeting's own column, with today's painted door, "Day N", and an accent
 * dot while today's door is still shut. It shows only under a Christmas
 * theme (the `snowy-roofline` scene) and only from Dec 1 to Jan 6, local
 * time. The chip is the date line's height, so it moves nothing.
 */
export function AdventChip() {
    const { scene } = useColorThemeDefinition();
    const season = adventSeason(useLocalToday());
    if (scene !== 'snowy-roofline' || season === null) {
        return null;
    }
    return <AdventEntry season={season} />;
}

function AdventEntry({ season }: { season: AdventSeason }) {
    const { server } = useServerContext();
    const opened = useOpenedDays(server.id, season.year);
    const [isOpen, setIsOpen] = React.useState(false);
    const unopened = isTodayUnopened(season, opened);
    const allOpen = season.today > adventDoorCount;
    const label = allOpen ? 'Your year' : `Day ${season.today}`;

    return (
        <>
            {/* A React Aria Button, not a native one: Safari never focuses a clicked
                button, so the dialog would hand focus back to the page body on close. */}
            <Button
                aria-label={
                    allOpen
                        ? 'Open the advent calendar, your year in Haus'
                        : `Open the advent calendar, day ${season.today}`
                }
                className="inline-flex shrink-0 cursor-(--cursor-interactive) rounded-2xl outline-none data-[focus-visible]:ring-2 data-[focus-visible]:ring-focus"
                onPress={() => setIsOpen(true)}
            >
                <Chip size="sm" variant="secondary">
                    <img
                        alt=""
                        className="h-3.5 w-3 object-contain"
                        draggable={false}
                        height={14}
                        src={unopened ? doorArt[doorColor(season.today)] : nicheArt}
                        width={12}
                    />
                    <Chip.Label>{label}</Chip.Label>
                    {unopened ? (
                        <span
                            aria-hidden="true"
                            className="size-1.5 shrink-0 rounded-full bg-accent"
                        />
                    ) : null}
                </Chip>
            </Button>
            {isOpen ? (
                <AdventCalendarDialog
                    onClose={() => setIsOpen(false)}
                    season={season}
                    serverId={server.id}
                />
            ) : null}
        </>
    );
}
