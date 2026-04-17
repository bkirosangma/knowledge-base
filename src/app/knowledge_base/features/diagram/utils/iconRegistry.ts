import type { ComponentType } from "react";
import {
  Activity,
  Archive,
  BarChart,
  Bell,
  Box,
  Cable,
  Cloud,
  CloudCog,
  Code,
  Cog,
  Container,
  Cpu,
  Database,
  DatabaseZap,
  FileCode,
  Fingerprint,
  Folder,
  GitBranch,
  Globe,
  HardDrive,
  Key,
  Laptop,
  Layers,
  Lock,
  Mail,
  Monitor,
  Network,
  Plug,
  Radio,
  Router,
  Server,
  ServerCog,
  Shield,
  ShieldCheck,
  Smartphone,
  Tablet,
  Terminal,
  User,
  Users,
  Wifi,
  Zap,
} from "lucide-react";

type IconProps = { size?: number; className?: string; strokeWidth?: number };

const iconRegistry: Record<string, ComponentType<IconProps>> = {
  Activity,
  Archive,
  BarChart,
  Bell,
  Box,
  Cable,
  Cloud,
  CloudCog,
  Code,
  Cog,
  Container,
  Cpu,
  Database,
  DatabaseZap,
  FileCode,
  Fingerprint,
  Folder,
  GitBranch,
  Globe,
  HardDrive,
  Key,
  Laptop,
  Layers,
  Lock,
  Mail,
  Monitor,
  Network,
  Plug,
  Radio,
  Router,
  Server,
  ServerCog,
  Shield,
  ShieldCheck,
  Smartphone,
  Tablet,
  Terminal,
  User,
  Users,
  Wifi,
  Zap,
};

export function getIcon(name: string): ComponentType<IconProps> | undefined {
  return iconRegistry[name];
}

export function getIconName(icon: ComponentType<IconProps>): string {
  // Reverse-lookup so the name we write on save is always a valid registry
  // key. Relying on `displayName` breaks for lucide legacy aliases (e.g.
  // BarChart → ChartNoAxesColumnIncreasing) where the alias and the
  // underlying component's displayName differ — serializing the displayName
  // would write a name that later fails the registry lookup on load.
  for (const [name, component] of Object.entries(iconRegistry)) {
    if (component === icon) return name;
  }
  return "Unknown";
}

export function getIconNames(): string[] {
  return Object.keys(iconRegistry);
}
