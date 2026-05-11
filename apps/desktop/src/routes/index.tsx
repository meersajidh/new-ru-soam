import { createFileRoute } from '@tanstack/react-router';
import Welcome from '../Welcome';

export const Route = createFileRoute('/')({
  component: Welcome,
});
