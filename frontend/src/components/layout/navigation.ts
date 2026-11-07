import { Box, House, Layers, LayoutGrid, Server, Settings, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import { dataService } from '../../services/dataService';
import type { OnlineStatus } from '../../types/models';
import { features } from '../../lib/features';

export interface NavChild {
  to: string;
  label: string;
  /** Kennung des Systems – für den Live-Status im Menü */
  slug?: string;
  icon?: LucideIcon;
  status?: OnlineStatus;
}

export interface NavLinkItem {
  kind: 'link';
  id: string;
  to: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroupItem {
  kind: 'group';
  id: string;
  label: string;
  icon: LucideIcon;
  /** Alle Routen unterhalb dieses Pfads gehören zur Gruppe */
  basePath: string;
  /** Optionale Übersichtsseite der Gruppe */
  to?: string;
  children: NavChild[];
}

export type NavItem = NavLinkItem | NavGroupItem;

/** Hauptmenü – einzige Quelle für Sidebar-Einträge. */
export function getNavigation(): NavItem[] {
  const items: (NavItem | false)[] = [
    { kind: 'link', id: 'dashboard', to: '/dashboard', label: 'Dashboard', icon: House },
    {
      kind: 'group',
      id: 'systeme',
      label: 'Systeme',
      icon: Server,
      basePath: '/systeme',
      children: dataService.getSystems().map((s) => ({ to: s.path, label: s.label, status: s.status, slug: s.id })),
    },
    features.agents && { kind: 'link', id: 'agents', to: '/agents', label: 'Agents', icon: Box },
    { kind: 'link', id: 'llm', to: '/llm', label: 'LLM', icon: Layers },
    {
      kind: 'group',
      id: 'konfiguration',
      label: 'Konfiguration',
      icon: Settings,
      basePath: '/konfiguration',
      to: '/konfiguration',
      children: configSections.map((s) => ({ to: `/konfiguration/${s.slug}`, label: s.label, icon: s.icon })),
    },
  ];
  return items.filter((item): item is NavItem => Boolean(item));
}

export interface ConfigSection {
  slug: string;
  label: string;
  icon: LucideIcon;
}

/** Konfigurationsbereiche; ausgeblendete führen über die Route zurück zur Übersicht. */
export const configSections: ConfigSection[] = [
  { slug: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
  { slug: 'systeme', label: 'Systeme', icon: Server },
  { slug: 'agents', label: 'Agents', icon: Box },
  { slug: 'llm', label: 'LLM', icon: Layers },
  { slug: 'mira', label: 'MIRA', icon: SlidersHorizontal },
].filter((s) => s.slug !== 'agents' || features.agents);
