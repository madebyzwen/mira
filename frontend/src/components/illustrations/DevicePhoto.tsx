import type { ReactNode } from 'react';

/**
 * Optionale Gerätefotos aus `src/assets/devices/`.
 *
 * Liegt dort z. B. `shelly-plug.png`, wird das Foto angezeigt; andernfalls
 * die mitgelieferte SVG-Grafik (`fallback`).
 */
const photos = import.meta.glob('../../assets/devices/*.{png,webp,jpg,jpeg}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

function findPhoto(name: string): string | undefined {
  const match = Object.entries(photos).find(([path]) => {
    const file = path.split('/').pop() ?? '';
    return file.slice(0, file.lastIndexOf('.')).toLowerCase() === name;
  });
  return match?.[1];
}

interface DevicePhotoProps {
  /** Dateiname ohne Endung, z. B. `shelly-plug` oder `odin` */
  name: string;
  alt: string;
  fallback: ReactNode;
  className?: string;
}

export function DevicePhoto({ name, alt, fallback, className }: DevicePhotoProps) {
  const src = findPhoto(name);
  if (!src) return <>{fallback}</>;
  return <img className={['device-photo', className].filter(Boolean).join(' ')} src={src} alt={alt} />;
}
