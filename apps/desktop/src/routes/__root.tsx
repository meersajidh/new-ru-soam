import { createRootRoute, Outlet } from '@tanstack/react-router';
import Workbench from '../workbench/Workbench';

export const Route = createRootRoute({
  component: () => <Workbench renderMiddleOverride={<Outlet />} />,
});
