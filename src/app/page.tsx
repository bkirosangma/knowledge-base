"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

const PIXEL = 4;
const TORTOISE_COLOR = "#2d6a4f";
const SHELL_COLOR = "#52b788";
const SHELL_HIGHLIGHT = "#95d5b2";
const BELLY_COLOR = "#b7e4c7";
const EYE_COLOR = "#081c15";

// Two walking frames for the tortoise, drawn on a 16x12 grid
const frames = [
  // Frame 1 - legs extended
  [
    "................",
    "....SSSSSS......",
    "...SHHHSSSS.....",
    "...SSHSSSHSS....",
    "..SSSSSSSSSS....",
    ".BSSSSSSSSSSB...",
    "TTBSSSSSSSSBT...",
    "TT.BBBBBBBB.TT..",
    ".T..T....T..T...",
    "..TT......TT....",
    "................",
    "................",
  ],
  // Frame 2 - legs together
  [
    "................",
    "....SSSSSS......",
    "...SHHHSSSS.....",
    "...SSHSSSHSS....",
    "..SSSSSSSSSS....",
    ".BSSSSSSSSSSB...",
    "..BSSSSSSSSB....",
    "TT.BBBBBBBB.TT..",
    "TT...T..T...TT..",
    "......TT........",
    "................",
    "................",
  ],
];

// Head pixels (added separately so it moves)
const headFrames = [
  // Frame 1 - head up
  [
    [14, 2, TORTOISE_COLOR],
    [15, 2, TORTOISE_COLOR],
    [14, 3, TORTOISE_COLOR],
    [15, 3, TORTOISE_COLOR],
    [15, 2, EYE_COLOR], // eye
    [14, 1, TORTOISE_COLOR],
    [15, 1, TORTOISE_COLOR],
  ],
  // Frame 2 - head down
  [
    [14, 3, TORTOISE_COLOR],
    [15, 3, TORTOISE_COLOR],
    [14, 4, TORTOISE_COLOR],
    [15, 4, TORTOISE_COLOR],
    [15, 3, EYE_COLOR], // eye
    [14, 2, TORTOISE_COLOR],
    [15, 2, TORTOISE_COLOR],
  ],
];

function drawTortoise(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  frame: number
) {
  const map: Record<string, string> = {
    S: SHELL_COLOR,
    H: SHELL_HIGHLIGHT,
    T: TORTOISE_COLOR,
    B: BELLY_COLOR,
    E: EYE_COLOR,
  };

  const grid = frames[frame];
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      const ch = grid[row][col];
      if (ch !== ".") {
        ctx.fillStyle = map[ch];
        ctx.fillRect(x + col * PIXEL, y + row * PIXEL, PIXEL, PIXEL);
      }
    }
  }

  // Draw head
  for (const [px, py, color] of headFrames[frame]) {
    ctx.fillStyle = color as string;
    ctx.fillRect(
      x + (px as number) * PIXEL,
      y + (py as number) * PIXEL,
      PIXEL,
      PIXEL
    );
  }
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let tortoiseX = -80;
    let frame = 0;
    let tick = 0;

    const width = canvas.width;
    const y = canvas.height / 2 - 24;

    function animate() {
      ctx!.clearRect(0, 0, width, canvas!.height);

      // Draw ground
      ctx!.fillStyle = "#d4a373";
      ctx!.fillRect(0, canvas!.height / 2 + 28, width, 4);

      // Some grass tufts
      ctx!.fillStyle = "#588157";
      for (let gx = 0; gx < width; gx += 60) {
        ctx!.fillRect(gx + 10, canvas!.height / 2 + 24, 4, 4);
        ctx!.fillRect(gx + 14, canvas!.height / 2 + 20, 4, 4);
        ctx!.fillRect(gx + 18, canvas!.height / 2 + 24, 4, 4);
      }

      drawTortoise(ctx!, tortoiseX, y, frame);

      tick++;
      if (tick % 8 === 0) {
        frame = frame === 0 ? 1 : 0;
      }
      tortoiseX += 0.5;
      if (tortoiseX > width + 20) {
        tortoiseX = -80;
      }

      requestAnimationFrame(animate);
    }

    animate();
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#fefae0] gap-12">
      <h1 className="text-6xl font-bold text-[#2d6a4f] tracking-tight"
        style={{ fontFamily: "monospace", imageRendering: "pixelated" }}>
        Hello!
      </h1>
      <canvas
        ref={canvasRef}
        width={600}
        height={100}
        className="rounded-lg"
        style={{ imageRendering: "pixelated" }}
      />
      <p className="text-[#588157] font-mono text-sm">a tortoise takes a walk...</p>
      <Link href="/architecture_designer" className="px-8 py-3 bg-[#2d6a4f] text-[#fefae0] font-mono font-bold text-lg rounded-lg hover:bg-[#1b4332] transition-colors">
        Architecture Designer
      </Link>
    </div>
  );
}
