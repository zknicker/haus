import { ItemCard, ItemCardGroup, PressableFeedback } from '@heroui-pro/react';
import { ArrowRight01Icon, RepositoryIcon } from '@hugeicons-pro/core-stroke-rounded';
import type { IconSvgElement } from '@hugeicons/react';
import { Link, type To, useParams } from 'react-router-dom';
import { Icon } from '../../../components/ui/icon.tsx';
import { serverSettingsSectionRoute } from '../../servers/server-routes.ts';

export function SettingsLinkRow({
    children,
    icon,
    to,
}: {
    children: string;
    icon: IconSvgElement;
    to: To;
}) {
    return (
        <ItemCardGroup variant="secondary">
            <ItemCard<'a'>
                className="relative w-full cursor-(--cursor-interactive) overflow-hidden text-left"
                render={(props) => <Link {...props} to={to} />}
                variant="transparent"
            >
                <PressableFeedback.Highlight />
                <Icon aria-hidden="true" className="text-muted shrink-0" icon={icon} size={16} />
                <ItemCard.Content>
                    <ItemCard.Description>{children}</ItemCard.Description>
                </ItemCard.Content>
                <ItemCard.Action>
                    <Icon
                        aria-hidden="true"
                        className="text-muted"
                        icon={ArrowRight01Icon}
                        size={16}
                    />
                </ItemCard.Action>
            </ItemCard>
        </ItemCardGroup>
    );
}

export function ReposLinkRow() {
    const { slug = '' } = useParams();
    return (
        <SettingsLinkRow icon={RepositoryIcon} to={serverSettingsSectionRoute(slug, 'repos')}>
            Manage the repositories Captains can check out
        </SettingsLinkRow>
    );
}
