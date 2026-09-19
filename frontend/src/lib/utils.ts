import { twMerge } from 'tailwind-merge'

export type ClassValue =
  | string
  | number
  | false
  | null
  | undefined
  | Record<string, boolean | undefined | null>

// Joins class values, then resolves Tailwind conflicts so a later class -- a
// caller's className -- always beats an earlier one, a component's base.
// Plain concatenation left that to stylesheet order, and Tailwind v4 emits
// same-property utilities in ascending value order: any override that
// *reduced* a value (h-9 over h-10, px-0 over px-4, rounded-full over
// rounded-md, hidden over inline-flex) silently lost to the base.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(join(inputs))
}

function join(inputs: ClassValue[]): string {
  return inputs
    .flatMap((input) => {
      if (!input) return []
      if (typeof input === 'string' || typeof input === 'number') {
        return [String(input)]
      }
      return Object.entries(input)
        .filter(([, value]) => Boolean(value))
        .map(([key]) => key)
    })
    .join(' ')
}
