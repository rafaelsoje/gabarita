"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toastError, toastSuccess } from "@/components/app-toast";

type PlanReferenceLink = {
  id: string;
  label: string;
  url: string;
  createdAt: string;
};

type PlanReferenceLinksManagerProps = {
  planId: string;
  initialCount: number;
};

export function PlanReferenceLinksManager({ planId, initialCount }: PlanReferenceLinksManagerProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [links, setLinks] = useState<PlanReferenceLink[]>([]);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const router = useRouter();

  const triggerLabel = useMemo(
    () => (initialCount > 0 ? `${initialCount} link(s)` : "Adicionar links"),
    [initialCount]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  async function loadLinks() {
    try {
      setLoading(true);
      const response = await fetch(`/api/plans/${planId}/links`, { method: "GET" });
      if (!response.ok) {
        toastError("Referências", "Não foi possível carregar os links.");
        return;
      }
      const data = (await response.json()) as { links: PlanReferenceLink[] };
      setLinks(data.links ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function openModal() {
    setOpen(true);
    await loadLinks();
  }

  async function addLink() {
    const cleanUrl = url.trim();
    if (!cleanUrl) {
      toastError("Referências", "Informe a URL do link.");
      return;
    }

    try {
      const parsed = new URL(cleanUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        toastError("Referências", "Use um link http:// ou https://.");
        return;
      }
    } catch {
      toastError("Referências", "URL inválida.");
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(`/api/plans/${planId}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim() || "Link de referência",
          url: cleanUrl
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        toastError("Referências", payload?.message ?? "Não foi possível adicionar o link.");
        return;
      }

      setLabel("");
      setUrl("");
      await loadLinks();
      toastSuccess("Referências", "Link adicionado.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function removeLink(linkId: string) {
    try {
      setSaving(true);
      const response = await fetch(`/api/plans/links/${linkId}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        toastError("Referências", "Não foi possível remover o link.");
        return;
      }

      setLinks((prev) => prev.filter((item) => item.id !== linkId));
      toastSuccess("Referências", "Link removido.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button type="button" className="topicLinksTrigger" onClick={openModal}>
        {triggerLabel}
      </button>

      {open && mounted
        ? createPortal(
            <div className="studyCommentModalOverlay" onClick={() => setOpen(false)}>
              <section className="topicLinksModal" onClick={(event) => event.stopPropagation()} aria-label="Gerenciar links de referência do plano">
                <header className="studyCommentModalHeader">
                  <h3>Links do concurso</h3>
                  <button type="button" className="studyCommentModalClose" onClick={() => setOpen(false)} aria-label="Fechar">
                    ✕
                  </button>
                </header>

                <div className="topicLinksList">
                  {loading ? <p className="emptyState">Carregando links...</p> : null}
                  {!loading && links.length === 0 ? <p className="emptyState">Nenhum link cadastrado.</p> : null}
                  {links.map((item) => (
                    <div key={item.id} className="topicLinksItem">
                      <a href={item.url} target="_blank" rel="noreferrer" title={item.url}>
                        {item.label}
                      </a>
                      <button type="button" className="topicLinksRemove" onClick={() => removeLink(item.id)} disabled={saving}>
                        Remover
                      </button>
                    </div>
                  ))}
                </div>

                <div className="topicLinksForm">
                  <input
                    className="input"
                    placeholder="Título do link (opcional)"
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                  />
                  <input className="input" placeholder="https://..." value={url} onChange={(event) => setUrl(event.target.value)} />
                </div>

                <div className="studyCommentModalActions">
                  <button type="button" className="secondaryBtn" onClick={() => setOpen(false)} disabled={saving}>
                    Fechar
                  </button>
                  <button type="button" className="button" onClick={addLink} disabled={saving}>
                    {saving ? "Salvando..." : "Adicionar link"}
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
