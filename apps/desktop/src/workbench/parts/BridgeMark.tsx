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
      {...(title != null
        ? { 'aria-label': title, role: 'img' as const }
        : { 'aria-hidden': true as const })}
    />
  );
}
