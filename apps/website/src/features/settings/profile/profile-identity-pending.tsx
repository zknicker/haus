import { Input, Separator, TextField } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Fragment } from 'react';

/** Reserve the identity rows without inventing an editable member. */
export function ProfileIdentityPending({ error }: { error?: string }) {
    return (
        <ItemCardGroup aria-busy={!error} className="overflow-hidden">
            {error ? (
                <p className="text-danger text-sm" role="alert">
                    {error}
                </p>
            ) : null}
            {[
                { title: 'Photo', description: 'Shown beside your messages.' },
                { title: 'Display Name', description: 'Shown beside your messages.' },
                { title: 'Handle', description: 'Your unique @name on this Server.' },
            ].map((row, index) => (
                <Fragment key={row.title}>
                    {index > 0 ? <Separator /> : null}
                    <ItemCard>
                        <ItemCard.Content>
                            <ItemCard.Title>{row.title}</ItemCard.Title>
                            <ItemCard.Description>{row.description}</ItemCard.Description>
                        </ItemCard.Content>
                        <ItemCard.Action>
                            {row.title === 'Photo' ? (
                                <div aria-hidden="true" className="size-10" />
                            ) : (
                                <TextField
                                    aria-label={
                                        row.title === 'Display Name' ? 'Display name' : row.title
                                    }
                                    className="w-56 max-w-full"
                                    isDisabled
                                    value=""
                                    variant="secondary"
                                >
                                    <Input />
                                </TextField>
                            )}
                        </ItemCard.Action>
                    </ItemCard>
                </Fragment>
            ))}
        </ItemCardGroup>
    );
}
