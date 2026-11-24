import { type Project, artifactPathKey } from '@haus/api';
import { ItemCard, ItemCardGroup, PressableFeedback } from '@heroui-pro/react';
import { ArrowRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Link } from 'react-router-dom';
import { Icon } from '../../../components/ui/icon.tsx';
import { useDriveFolderFiles } from '../../../hooks/artifacts/use-drive-folder-files.ts';
import { artifactViewerHref, libraryHref } from '../../artifacts/library-params.ts';

export function ProjectRulesSection({ project, slug }: { project: Project; slug: string }) {
    const folder = `projects/${project.key}`;
    const listing = useDriveFolderFiles(project.serverId, folder);
    const rules = listing.files?.find(
        (file) => artifactPathKey(file.path) === artifactPathKey(`${folder}/AGENTS.md`)
    );
    const view = { creator: null, folder, kind: 'all' } as const;
    const href = rules
        ? artifactViewerHref(slug, rules.artifact_id, { ...view, query: '' })
        : libraryHref(slug, view);

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Rules</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup>
                <ItemCard<'a'>
                    className="relative w-full cursor-(--cursor-interactive) overflow-hidden text-left"
                    render={(props) => <Link {...props} to={href} />}
                >
                    <PressableFeedback.Highlight />
                    <ItemCard.Content>
                        <ItemCard.Title>AGENTS.md</ItemCard.Title>
                        <ItemCard.Description>
                            Every Captain and Worker in this project follows it.
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
