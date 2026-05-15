import { createFileRoute } from '@tanstack/react-router';
import Workbench from '../workbench/Workbench';

export const Route = createFileRoute('/')({
  component: Workbench,
});
