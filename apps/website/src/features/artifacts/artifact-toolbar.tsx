import { Button, Tooltip } from '@heroui/react';
import { Segment } from '@heroui-pro/react';
import { Grid2X2, List, RefreshCw } from 'lucide-react';

export function ArtifactLayoutControl({
    layout,
    onChange,
}: {
    layout: 'grid' | 'list';
    onChange: (layout: 'grid' | 'list') => void;
}) {
    return (
        <Segment
            aria-label="Artifact layout"
            onSelectionChange={(key) => {
                if (key === 'grid' || key === 'list') {
                    onChange(key);
                }
            }}
            selectedKey={layout}
            size="sm"
        >
            <Segment.Item aria-label="Grid" id="grid">
                <Grid2X2 aria-hidden="true" size={16} />
            </Segment.Item>
            <Segment.Item aria-label="List" id="list">
                <List aria-hidden="true" size={16} />
            </Segment.Item>
        </Segment>
    );
}

export function ArtifactRefreshButton({ onRefresh }: { onRefresh: () => unknown }) {
    return (
        <Tooltip delay={0}>
            <Button aria-label="Refresh" isIconOnly onPress={onRefresh} size="sm" variant="ghost">
                <RefreshCw aria-hidden="true" size={16} />
            </Button>
            <Tooltip.Content>Refresh</Tooltip.Content>
        </Tooltip>
    );
}
