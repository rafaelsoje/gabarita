"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

type ConcursosFiltersFormProps = {
  selectedStatus: string;
  selectedState: string;
  selectedIncludeNational: boolean;
  states: ReadonlyArray<{ value: string; label: string }>;
};

export function ConcursosFiltersForm(props: ConcursosFiltersFormProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [status, setStatus] = useState(props.selectedStatus);
  const [state, setState] = useState(props.selectedState);
  const [includeNational, setIncludeNational] = useState(props.selectedIncludeNational);

  function applyFilters(next: { status?: string; state?: string; includeNational?: boolean }) {
    const params = new URLSearchParams(searchParams.toString());

    const nextStatus = next.status ?? status;
    const nextState = next.state ?? state;
    const nextIncludeNational = next.includeNational ?? includeNational;

    const uf = nextState ? nextState.toLowerCase() : "";
    if (uf) params.set("uf", uf);
    else params.delete("uf");
    if (nextStatus) params.set("status", nextStatus);
    else params.delete("status");

    if (nextState) params.set("state", nextState);
    else params.delete("state");
    params.delete("source");
    if (nextIncludeNational) params.set("includeNational", "1");
    else params.delete("includeNational");

    params.delete("toast");
    params.delete("syncError");

    const query = params.toString();
    const href = query ? `${pathname}?${query}` : pathname;

    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }

  return (
    <form className="historyFiltersForm concursosFiltersForm" onSubmit={(event) => event.preventDefault()}>
      <label className="historyFilterField">
        <span>Status</span>
        <select
          name="status"
          value={status}
          onChange={(event) => {
            const value = event.target.value;
            setStatus(value);
            applyFilters({ status: value });
          }}
        >
          <option value="">Todos</option>
          <option value="OPEN">Abertos</option>
          <option value="PLANNED">Previstos</option>
        </select>
      </label>

      <label className="historyFilterField">
        <span>UF</span>
        <select
          name="state"
          value={state}
          onChange={(event) => {
            const value = event.target.value;
            const forceDisableNationalMix = value === "NACIONAL" && includeNational;
            setState(value);
            if (forceDisableNationalMix) {
              setIncludeNational(false);
            }
            applyFilters({ state: value, includeNational: forceDisableNationalMix ? false : includeNational });
          }}
        >
          <option value="">Selecione</option>
          {props.states.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      <div className="historyFilterField concursosInlineToggle">
        <span>Combinação</span>
        <label className="concursosCheckboxLabel">
          <input
            type="checkbox"
            checked={includeNational}
            disabled={state === "NACIONAL"}
            onChange={(event) => {
              const value = event.target.checked;
              setIncludeNational(value);
              applyFilters({ includeNational: value });
            }}
          />
          <span>Incluir nacionais com a UF</span>
        </label>
      </div>

    </form>
  );
}
