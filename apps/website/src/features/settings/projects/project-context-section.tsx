import { type Project, artifactPathKey } from '@haus/api';
import { ItemCard, ItemCardGroup, PressableFeedback } from '@heroui-pro/react';
import { Separator } from '@heroui/react';
import { ArrowRight01Icon, File02Icon, RepositoryIcon } from '@hugeicons-pro/core-stroke-rounded';
import type { IconSvgElement } from '@hugeicons/react';
import { Link } from 'react-router-dom';
import { Icon } from '../../../components/ui/icon.tsx';
import { useDriveFolderFiles } from '../../../hooks/artifacts/use-drive-folder-files.ts';
import { artifactViewerHref, libraryHref } from '../../artifacts/library-params.ts';
import { serverSettingsSectionRoute } from '../../servers/server-routes.ts';

export function ProjectContextSection({ project, slug }: { project: Project; slug: string }) {
    const rulesHref = useProjectRulesHref(project, slug);

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Context</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup>
                <ProjectLinkRow
                    description="Every Captain and Task in this project follows it."
                    href={rulesHref}
                    icon={File02Icon}
                    title="AGENTS.md"
                />
                <Separator />
                <ProjectLinkRow
                    description="Captains here can work in any Server repo on their Device."
                    href={serverSettingsSectionRoute(slug, 'repos')}
                    icon={RepositoryIcon}
                    title="Server repositories"
                />
            </ItemCardGroup>
        </ItemCardGroup>
    );
}

function ProjectLinkRow({
    description,
    href,
    icon,
    title,
}: {
    description: string;
    href: string;
    icon: IconSvgElement;
    title: string;
}) {
    return (
        <ItemCard<'a'>
            className="relative w-full cursor-(--cursor-interactive) overflow-hidden text-left"
            render={(props) => <Link {...props} to={href} />}
        >
            <PressableFeedback.Highlight />
            <ItemCard.Icon>
                <Icon aria-hidden="true" icon={icon} />
            </ItemCard.Icon>
            <ItemCard.Content>
                <ItemCard.Title>{title}</ItemCard.Title>
                <ItemCard.Description>{description}</ItemCard.Description>
            </ItemCard.Content>
            <ItemCard.Action>
                <Icon aria-hidden="true" className="text-muted" icon={ArrowRight01Icon} size={16} />
            </ItemCard.Action>
        </ItemCard>
    );
}

function useProjectRulesHref(project: Project, slug: string) {
    const folder = `projects/${project.key}`;
    const listing = useDriveFolderFiles(project.serverId, folder);
    const rules = listing.files?.find(
        (file) => artifactPathKey(file.path) === artifactPathKey(`${folder}/AGENTS.md`)
    );
    const view = { creator: null, folder, kind: 'all' } as const;
    return rules
        ? artifactViewerHref(slug, rules.artifact_id, { ...view, query: '' })
        : libraryHref(slug, view);
}
