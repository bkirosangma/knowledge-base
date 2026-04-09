import type { ComponentType } from "react";
import {
  Monitor,
  Network,
  Database,
  Archive,
  Cloud,
  Settings,
} from "lucide-react";

type IconProps = { size?: number; className?: string; strokeWidth?: number };

const iconRegistry: Record<string, ComponentType<IconProps>> = {
  Monitor,
  Network,
  Database,
  Archive,
  Cloud,
  Settings,
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
