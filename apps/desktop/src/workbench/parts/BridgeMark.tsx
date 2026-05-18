interface BridgeMarkProps {
  size?: number;
  title?: string;
}

export default function BridgeMark({ size = 22, title }: BridgeMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title == null ? true : undefined}
      aria-label={title}
      role={title != null ? 'img' : undefined}
    >
      <path d="M5 5v12" />
      <path d="M19 5v12" />
      <path d="M3 17h18" />
      <path d="M5 7 Q 12 14 19 7" />
      <path d="M9 11.4v5.6" strokeWidth="1.2" />
      <path d="M12 12.4v4.6" strokeWidth="1.2" />
      <path d="M15 11.4v5.6" strokeWidth="1.2" />
    </svg>
  );
}
