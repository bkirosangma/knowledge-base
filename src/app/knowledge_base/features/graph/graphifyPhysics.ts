export interface PhysicsConfig {
  linkDistance: number;
  linkStrength: number;
  repelForce: number;
  centerForce: number;
}

export const DEFAULT_PHYSICS: PhysicsConfig = {
  linkDistance: 70,
  linkStrength: 0.3,
  repelForce: 400,
  centerForce: 0.05,
};

export const PHYSICS_SLIDERS = [
  { key: "linkDistance" as const, label: "Link distance", min: 10,  max: 300,  step: 5    },
  { key: "linkStrength" as const, label: "Link strength", min: 0,   max: 1,    step: 0.01 },
  { key: "repelForce"   as const, label: "Repel force",   min: 0,   max: 1000, step: 10   },
  { key: "centerForce"  as const, label: "Center force",  min: 0,   max: 1,    step: 0.01 },
] satisfies { key: keyof PhysicsConfig; label: string; min: number; max: number; step: number }[];
