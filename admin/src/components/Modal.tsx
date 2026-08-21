import { ReactNode } from "react";
import { Button } from "./ui";

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidth = "max-w-2xl",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className={`bg-dark-800 border border-dark-600 rounded-xl p-6 ${maxWidth} w-full max-h-[85vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold">{title}</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">
              ✕
            </button>
          </div>
        )}
        {children}
        {footer && <div className="flex justify-end gap-3 pt-4">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmationDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirmar",
  danger = true,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-md">
      <p className="text-sm text-gray-300 mb-5">{message}</p>
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
