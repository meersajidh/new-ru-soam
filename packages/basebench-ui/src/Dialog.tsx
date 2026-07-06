import './Dialog.css';

interface DialogProps {
  open: boolean;
  onClose?: () => void;
  width?: number; // default: 400
  'aria-label'?: string;
  'aria-labelledby'?: string;
  children: React.ReactNode;
}

export function Dialog({ open, onClose, width = 400, children, ...aria }: DialogProps) {
  if (!open) return null;

  function handleOverlayClick() {
    onClose?.();
  }

  return (
    <div className="dialog-overlay" onClick={handleOverlayClick}>
      <div
        className="dialog-card"
        style={{ width }}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        {...aria}
      >
        {children}
      </div>
    </div>
  );
}
