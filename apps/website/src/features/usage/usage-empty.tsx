import { EmptyState } from '@heroui-pro/react';
import { Card } from '@heroui/react';
import { ChartHistogramIcon } from '@hugeicons-pro/core-stroke-rounded';

import { Icon } from '../../components/ui/icon.tsx';

/**
 * The one usage empty/error card, in the app's stock EmptyState anatomy —
 * these were hand-rolled centered paragraphs, the same drift the workspace
 * empty state had. Mirrors the token-configuration grid's empty panel.
 */
export function UsageEmptyCard({ description, title }: { description: string; title: string }) {
    return (
        <Card>
            <Card.Content className="flex justify-center py-12">
                <EmptyState>
                    <EmptyState.Header>
                        <EmptyState.Media variant="icon">
                            <Icon className="size-5" icon={ChartHistogramIcon} />
                        </EmptyState.Media>
                        <EmptyState.Title>{title}</EmptyState.Title>
                        <EmptyState.Description className="max-w-sm text-pretty">
                            {description}
                        </EmptyState.Description>
                    </EmptyState.Header>
                </EmptyState>
            </Card.Content>
        </Card>
    );
}
