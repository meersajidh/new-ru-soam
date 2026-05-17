import { createFileRoute } from '@tanstack/react-router';
import PreWorkspaceRoute from '../workbench/middle/PreWorkspaceRoute';

export const Route = createFileRoute('/')({
  component: PreWorkspaceRoute,
});
