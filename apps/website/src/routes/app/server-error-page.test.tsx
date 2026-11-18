import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { ServerErrorPage } from './server-error-page.tsx';

test('a page failure keeps the Server shell and hides the error behind technical details', async () => {
    const router = createMemoryRouter(
        [
            {
                children: [
                    {
                        children: [
                            {
                                element: <span>Members</span>,
                                loader: () => {
                                    throw new Error('Profile exploded');
                                },
                                path: 'members',
                            },
                        ],
                        errorElement: <ServerErrorPage />,
                    },
                ],
                element: (
                    <>
                        <span>Persistent Server shell</span>
                        <Outlet />
                    </>
                ),
                path: '/s/:slug',
            },
        ],
        { initialEntries: ['/s/dev'] }
    );
    await router.navigate('/s/dev/members');

    const html = renderToStaticMarkup(<RouterProvider router={router} />);

    expect(html).toContain('Persistent Server shell');
    expect(html).toContain('Oops, Something Went Wrong');
    expect(html).toContain('Technical Details');
    expect(html).toContain('Profile exploded');
});
