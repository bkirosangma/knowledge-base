import React from "react";

interface LayerProps {
  id: string;
  title: string;
  top: number;
  height: number;
  bg: string;
  border: string;
}

export default function Layer({ title, top, height, bg, border }: LayerProps) {
  return (
    <>
      <div
        className={`absolute left-5 right-5 rounded-xl border border-dashed ${bg} ${border}`}
        style={{ top, height }}
      />
      <span
        className="absolute left-10 font-bold text-slate-700 tracking-wider text-[11px]"
        style={{ top: top + 12 }}
      >
        {title}
      </span>
    </>
  );
}
