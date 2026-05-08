interface PartialMessageStreamProps {
  isStreaming: boolean;
}

export function PartialMessageStream({ isStreaming }: PartialMessageStreamProps) {
  if (!isStreaming) return null;
  return (
    <span aria-label="streaming" className="ml-0.5 inline-block animate-pulse text-mute">▍</span>
  );
}
