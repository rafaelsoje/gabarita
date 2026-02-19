"use client";

import { useState } from "react";
import { toastError, toastSuccess } from "@/components/app-toast";

type PreferencesConcursosFormProps = {
  initialEnabled: boolean;
  initialRegions: string[];
  regions: string[];
};

export function PreferencesConcursosForm(props: PreferencesConcursosFormProps) {
  const [enabled, setEnabled] = useState(props.initialEnabled);
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set(props.initialRegions));
  const [isSaving, setIsSaving] = useState(false);

  function toggleRegion(region: string, checked: boolean) {
    setSelectedRegions((prev) => {
      const next = new Set(prev);
      if (checked) next.add(region);
      else next.delete(region);
      return next;
    });
  }

  async function save() {
    setIsSaving(true);
    try {
      const response = await fetch("/api/preferences/concursos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          regions: Array.from(selectedRegions)
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(payload.message || "Falha ao salvar notificações de concursos.");
      }

      toastSuccess("Notificações de concursos", "Configurações salvas com sucesso.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao salvar notificações de concursos.";
      toastError("Notificações de concursos", message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="profileForm preferencesPanel">
      <h2 className="profileSectionTitle">Notificações de concursos</h2>
      <p className="profileMeta">Notifica apenas concursos abertos nas regiões selecionadas e avisa no último dia de inscrição.</p>

      <label className="checkboxRow" htmlFor="notifyConcursosEnabled_client">
        <input
          id="notifyConcursosEnabled_client"
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        <span>Ativar notificações de concursos</span>
      </label>

      <div className="preferencesRegionChooser">
        <label className="checkboxRow" htmlFor="notifyConcursosRegions_all_client">
          <input
            id="notifyConcursosRegions_all_client"
            type="checkbox"
            checked={selectedRegions.has("ALL")}
            onChange={(event) => toggleRegion("ALL", event.target.checked)}
          />
          <span>Todos os estados (UF)</span>
        </label>
        <div className="preferencesRegionGrid">
          {props.regions.map((region) => (
            <label key={region} className="checkboxRow preferencesRegionItem" htmlFor={`notifyConcursosRegions_${region}_client`}>
              <input
                id={`notifyConcursosRegions_${region}_client`}
                type="checkbox"
                checked={selectedRegions.has(region)}
                onChange={(event) => toggleRegion(region, event.target.checked)}
              />
              <span>{region === "NACIONAL" ? "Nacional" : region}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="profileActions preferencesActions">
        <button className="button createPlanBtn" type="button" disabled={isSaving} onClick={save}>
          {isSaving ? "Salvando..." : "Salvar notificações de concursos"}
        </button>
      </div>
    </div>
  );
}

