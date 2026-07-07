import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names — clsx (conditional joins) + tailwind-merge (dedupes
 * conflicting Tailwind utilities, last-wins). The single `cn` for the kit;
 * `@basebench/ui/lib/utils` (shadcn call sites) re-exports this.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
