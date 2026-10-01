import { Separator } from '@heroui/react';
import { ItemCard, ItemCardGroup, PressableFeedback } from '@heroui-pro/react';
import { Tick02Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Fragment } from 'react';
import { Link, useMatch } from 'react-router-dom';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import type { ServerSummary } from '../../../lib/haus-server.tsx';
import { serverRoute } from '../../servers/server-routes.ts';

/**
 * The Servers you belong to, as the same pressable ItemCard row every other
 * settings list uses.
 *
 * This reused the sidebar-style ServerSwitcher, whose active row is a gray
 * fill. On a settings page that read as a stuck hover band, so the Server you
 * are in carries the switcher's own mark: an accent check, as in any menu.
 */
export function ServerList({ servers }: { servers: ServerSummary[] }) {
    if (servers.length === 0) {
        return null;
    }

    return (
        <nav aria-label="Your Servers">
            <ItemCardGroup className="overflow-hidden">
                {servers.map((server, index) => (
                    <Fragment key={server.id}>
                        {index > 0 ? <Separator /> : null}
                        <ServerRow server={server} />
                    </Fragment>
                ))}
            </ItemCardGroup>
        </nav>
    );
}

function ServerRow({ server }: { server: ServerSummary }) {
    const route = serverRoute(server.slug);
    const isCurrent = useMatch({ end: false, path: route }) !== null;

    return (
        <ItemCard<'a'>
            aria-current={isCurrent ? 'page' : undefined}
            className="relative w-full cursor-(--cursor-interactive) overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
            render={(props) => <Link {...props} to={route} />}
        >
            <PressableFeedback.Highlight />
            <ItemCard.Icon>
                <EntityAvatar name={server.displayName || server.slug} size="sm" />
            </ItemCard.Icon>
            <ItemCard.Content>
                <ItemCard.Title>{server.displayName}</ItemCard.Title>
                <ItemCard.Description>/{server.slug}</ItemCard.Description>
            </ItemCard.Content>
            {isCurrent ? (
                <ItemCard.Action>
                    <Icon className="text-accent" icon={Tick02Icon} size={18} />
                </ItemCard.Action>
            ) : null}
        </ItemCard>
    );
}
