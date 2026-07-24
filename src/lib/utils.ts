import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Pluralizzazione UNICA dell'app (F5): sceglie singolare/plurale in base al
 * conteggio. `one` per n === 1, `many` per tutto il resto (incluso 0).
 * Restituisce solo la parola; anteponi tu il numero dove serve.
 */
export function pluralize(count: number, one: string, many: string): string {
  return count === 1 ? one : many
}
