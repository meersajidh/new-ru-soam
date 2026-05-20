import BridgeFullSvg from '../../assets/bridge.full.svg?react';

interface BridgeMarkProps {
  size?: number;
  title?: string;
}

export default function BridgeMark({ size = 22, title }: BridgeMarkProps) {
  return (
    <BridgeFullSvg
      width={size}
      height={size}
      aria-hidden={title == null ? true : undefined}
      aria-label={title}
      role={title != null ? 'img' : undefined}
    />
  );
}
