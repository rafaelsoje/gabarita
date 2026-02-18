"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

type ConfirmSubmitButtonProps = {
  className?: string;
  label: ReactNode;
  confirmTitle?: string;
  confirmMessage?: string;
  confirmActionLabel?: string;
  cancelLabel?: string;
  ariaLabel?: string;
  title?: string;
  disabled?: boolean;
  formAction?: (formData: FormData) => void | Promise<void>;
};

export function ConfirmSubmitButton({
  className,
  label,
  confirmTitle = "Confirmar remoção",
  confirmMessage = "Tem certeza que deseja remover este item?",
  confirmActionLabel = "Remover",
  cancelLabel = "Cancelar",
  ariaLabel,
  title,
  disabled,
  formAction,
}: ConfirmSubmitButtonProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const submitRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  function confirmSubmit() {
    const form = submitRef.current?.form;
    setOpen(false);
    if (!form) return;
    form.requestSubmit(submitRef.current ?? undefined);
  }

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => setOpen(true)}
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
      >
        {label}
      </button>

      <button ref={submitRef} type="submit" formAction={formAction} hidden aria-hidden="true" tabIndex={-1} />

      {mounted && open
        ? createPortal(
            <div className="modalBackdrop" role="presentation" onClick={() => setOpen(false)}>
              <section className="confirmDialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                <h3>{confirmTitle}</h3>
                <p>{confirmMessage}</p>
                <div className="confirmDialogActions">
                  <button type="button" className="ghostButton" onClick={() => setOpen(false)}>
                    {cancelLabel}
                  </button>
                  <button type="button" className="dangerBtn confirmDangerBtn" onClick={confirmSubmit}>
                    {confirmActionLabel}
                  </button>
                </div>
              </section>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
