import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Alert, Input, Separator, TextField } from '@heroui/react';
import { Fragment } from 'react';
import { timezoneDescription } from './timezone-row.tsx';

export const handleDescription = 'Your unique @name on this Server.';

/** Reserve the identity rows without inventing an editable member. */
export function ProfileIdentityPending({ error }: { error?: string }) {
    return (
        <>
            {error ? (
                <Alert status="danger">
                    <Alert.Indicator />
                    <Alert.Content>
                        <Alert.Title>Profile unavailable</Alert.Title>
                        <Alert.Description>{error}</Alert.Description>
                    </Alert.Content>
                </Alert>
            ) : null}
            <ItemCardGroup aria-busy={!error}>
                {[
                    { title: 'Photo' },
                    { title: 'Display name' },
                    { description: handleDescription, title: 'Handle' },
                    { description: timezoneDescription, title: 'Timezone' },
                ].map((row, index) => (
                    <Fragment key={row.title}>
                        {index > 0 ? <Separator /> : null}
                        <ItemCard>
                            <ItemCard.Content>
                                <ItemCard.Title>{row.title}</ItemCard.Title>
                                {row.description ? (
                                    <ItemCard.Description className="whitespace-normal">
                                        {row.description}
                                    </ItemCard.Description>
                                ) : null}
                            </ItemCard.Content>
                            <ItemCard.Action>
                                {row.title === 'Photo' ? (
                                    <div aria-hidden="true" className="size-10" />
                                ) : (
                                    <TextField
                                        aria-label={row.title}
                                        className="w-56 max-w-full"
                                        isDisabled
                                        value=""
                                    >
                                        <Input />
                                    </TextField>
                                )}
                            </ItemCard.Action>
                        </ItemCard>
                    </Fragment>
                ))}
            </ItemCardGroup>
        </>
    );
}
