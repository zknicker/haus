import { Navigate, useParams } from 'react-router-dom';
import { serverRoute } from '../../features/servers/server-routes.ts';

/** The Inbox is gone; Home is where work starts, so old links land there. */
export function InboxPage() {
    const { slug = '' } = useParams();
    return <Navigate replace to={serverRoute(slug)} />;
}
