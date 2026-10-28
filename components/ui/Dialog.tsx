"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name of the dialog. */
  title: string;
  /** Visually hide the built-in title row (provide your own header). */
  hideHeader?: boolean;
  className?: string;
  children: React.ReactNode;
  closeOnBackdrop?: boolean;
  testId?: string;
}

/**
 * Modal built on the native <dialog> element: the browser provides the focus trap
 * (inert background), Escape-to-close and top-layer stacking. This component adds
 * background scroll locking, backdrop-click closing and focus restoration.
 */
export function Dialog({ open, onClose, title, hideHeader, className = "", children, closeOnBackdrop = true, testId }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      const prev = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";
      return () => {
        document.documentElement.style.overflow = prev;
        if (dialog.open) dialog.close();
        returnFocus.current?.focus?.({ preventScroll: true });
      };
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      data-testid={testId}
      onCancel={(e) => {
        e.preventDefault();
        onCloseRef.current();
      }}
      onClick={(e) => {
        // A click whose target is the <dialog> itself landed on the backdrop.
        if (closeOnBackdrop && e.target === ref.current) onCloseRef.current();
      }}
      className={`m-auto max-h-[calc(100dvh-1.5rem)] max-w-[calc(100vw-1.5rem)] overflow-hidden bg-transparent p-0 text-charcoal ${className}`}
    >
      {open && (
        <div className="flex h-full max-h-[inherit] flex-col bg-ivory">
          {!hideHeader && (
            <div className="flex items-center justify-between gap-4 border-b border-gold/30 px-5 py-3">
              <h2 className="font-display text-xl text-plum">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid size-9 place-items-center rounded-full text-plum transition hover:bg-plum/10"
              >
                <X className="size-5" />
              </button>
            </div>
          )}
          {children}
        </div>
      )}
    </dialog>
  );
}
