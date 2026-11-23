import { ItemCard, ItemCardGroup, PressableFeedback } from '@heroui-pro/react';
import { ArrowRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Link } from 'react-router-dom';
import { Icon } from '../../../components/ui/icon.tsx';
import { serverSettingsSectionRoute } from '../../servers/server-routes.ts';

export function ProjectReposSection({ slug }: { slug: string }) {
    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Repositories</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup>
                <ItemCard<'a'>
                    className="relative w-full cursor-(--cursor-interactive) overflow-hidden text-left"
                    render={(props) => (
                        <Link {...props} to={serverSettingsSectionRoute(slug, 'repos')} />
                    )}
                >
                    <PressableFeedback.Highlight />
                    <ItemCard.Content>
                        <ItemCard.Title>Server repositories</ItemCard.Title>
                        <ItemCard.Description>
                            Captains here can work in any Server repo on the Device a call runs on.
                        </ItemCard.Description>
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
        </ItemCardGroup>
    );
}
