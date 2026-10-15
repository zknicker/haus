import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AppRouteError } from './app-route-error.tsx';

test('an address no route matches says the page is not found, not a raw 404', () => {
    const router = createMemoryRouter(
        [
            {
                children: [{ element: <span>Home</span>, index: true }],
                errorElement: <AppRouteError />,
                path: '/',
            },
        ],
        { initialEntries: ['/no/such/page'] }
    );
    const html = renderToStaticMarkup(<RouterProvider router={router} />);
    expect(html).toContain('Page not found');
    expect(html).toContain('Go to Haus');
    expect(html).not.toContain('Unexpected Application Error');
});
