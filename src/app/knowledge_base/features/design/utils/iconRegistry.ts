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
  return (
    (icon as unknown as { displayName?: string }).displayName ??
    (icon as unknown as { name?: string }).name ??
    "Unknown"
  );
}

export function getIconNames(): string[] {
  return Object.keys(iconRegistry);
}
