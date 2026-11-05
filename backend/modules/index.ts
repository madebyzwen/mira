import type { MiraModule } from '../core/module.ts';
import { SystemsModule } from './systems/index.ts';

/**
 * Registrierte Fachmodule (Reihenfolge = Reihenfolge der Registrierung).
 * Neue Module werden hier eingetragen – bewusst statisch, kein Plugin-System.
 */
export function createModules(): MiraModule[] {
  return [new SystemsModule()];
}
