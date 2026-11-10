/**
 * Maß aus dem Entwurf (px bei 16 px Grundgröße) als rem – skaliert mit der
 * Grundgröße der Oberfläche (siehe `styles/tokens.css`).
 */
export function rem(px: number): string {
  return `${px / 16}rem`;
}
