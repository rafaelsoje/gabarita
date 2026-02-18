"use client";

import { useFormStatus } from "react-dom";

export function PlanningCreateSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="primaryBtn" type="submit" disabled={pending}>
      {pending ? (
        <span className="btnPendingContent">
          <span className="btnSpinner" aria-hidden="true" />
          Gerando planejamento...
        </span>
      ) : (
        "Gerar planejamento"
      )}
    </button>
  );
}

