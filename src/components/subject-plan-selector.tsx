"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type PlanOption = {
  id: string;
  title: string;
  targetUrl: string;
  imageUrl: string | null;
};

type SubjectPlanSelectorProps = {
  options: PlanOption[];
  currentPlanId: string;
};

export function SubjectPlanSelector({ options, currentPlanId }: SubjectPlanSelectorProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const currentPlan = useMemo(() => options.find((item) => item.id === currentPlanId) ?? options[0], [options, currentPlanId]);

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target as Node)) return;
      setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleOutside);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function handleSelect(plan: PlanOption) {
    setOpen(false);
    if (plan.id === currentPlanId) return;
    router.push(plan.targetUrl);
  }

  function getInitials(title: string) {
    return title
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "PL";
  }

  return (
    <div className="subjectDetailPlanSelectorWrap" ref={rootRef}>
      <button
        type="button"
        className={`subjectDetailPlanSelectBtn ${open ? "open" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="subjectDetailPlanPreview">
          {currentPlan?.imageUrl ? (
            <Image
              src={currentPlan.imageUrl}
              alt={`Plano ${currentPlan.title}`}
              width={24}
              height={24}
              className="subjectDetailPlanPreviewImage"
            />
          ) : (
            <span className="subjectDetailPlanPreviewFallback">{getInitials(currentPlan?.title ?? "Plano")}</span>
          )}
          <span className="subjectDetailPlanPreviewTitle">{currentPlan?.title ?? "Selecione um plano"}</span>
        </span>
        <span className="subjectDetailPlanCaret">▾</span>
      </button>

      {open ? (
        <div className="subjectDetailPlanMenu" role="listbox" aria-label="Selecionar plano">
          {options.map((plan) => (
            <button
              type="button"
              key={plan.id}
              className={`subjectDetailPlanMenuItem ${plan.id === currentPlanId ? "active" : ""}`}
              onClick={() => handleSelect(plan)}
              role="option"
              aria-selected={plan.id === currentPlanId}
            >
              {plan.imageUrl ? (
                <Image
                  src={plan.imageUrl}
                  alt={`Plano ${plan.title}`}
                  width={28}
                  height={28}
                  className="subjectDetailPlanItemImage"
                />
              ) : (
                <span className="subjectDetailPlanItemFallback">{getInitials(plan.title)}</span>
              )}
              <span>{plan.title}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
