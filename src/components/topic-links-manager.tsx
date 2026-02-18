"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { toastError, toastSuccess } from "@/components/app-toast";
import { buildTopicDescription, parseTopicDescription, type TopicStudyLink } from "@/lib/study/topic-links";

type TopicLinksManagerProps = {
  topicId: string;
  initialDescription: string | null;
};

function createLinkId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function TopicLinksManager({ topicId, initialDescription }: TopicLinksManagerProps) {
  const parsed = useMemo(() => parseTopicDescription(initialDescription), [initialDescription]);
  const [links, setLinks] = useState<TopicStudyLink[]>(parsed.links);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  async function persist(nextLinks: TopicStudyLink[]) {
    try {
      setSaving(true);
      const response = await fetch(`/api/topics/${topicId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: buildTopicDescription(parsed.plainText, nextLinks)
        })
      });

      if (!response.ok) {
        toastError("Links de estudo", "Não foi possível salvar os links.");
        return false;
      }

      setLinks(nextLinks);
      toastSuccess("Links de estudo", "Links atualizados com sucesso.");
      router.refresh();
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function addLink() {
    const cleanUrl = url.trim();
    if (!cleanUrl) {
      toastError("Links de estudo", "Informe a URL do link.");
      return;
    }

    try {
      const parsedUrl = new URL(cleanUrl);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        toastError("Links de estudo", "Use um link http:// ou https://.");
        return;
      }
    } catch {
      toastError("Links de estudo", "URL inválida.");
      return;
    }

    const nextLinks = [
      ...links,
      {
        id: createLinkId(),
        label: label.trim() || "Link de estudo",
        url: cleanUrl
      }
    ];

    const ok = await persist(nextLinks);
    if (!ok) return;
    setLabel("");
    setUrl("");
  }

  async function removeLink(id: string) {
    const nextLinks = links.filter((item) => item.id !== id);
    await persist(nextLinks);
  }

  return (
    <>
      <button type="button" className="topicLinksTrigger" onClick={() => setOpen(true)}>
        {links.length > 0 ? `${links.length} link(s)` : "Adicionar"}
      </button>

      {open && mounted
        ? createPortal(
            <div className="studyCommentModalOverlay" onClick={() => setOpen(false)}>
              <section className="topicLinksModal" onClick={(event) => event.stopPropagation()} aria-label="Gerenciar links do topico">
                <header className="studyCommentModalHeader">
                  <h3>Links de estudo</h3>
                  <button type="button" className="studyCommentModalClose" onClick={() => setOpen(false)} aria-label="Fechar">
                    ✕
                  </button>
                </header>

                <div className="topicLinksList">
                  {links.length === 0 ? <p className="emptyState">Nenhum link cadastrado.</p> : null}
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
                    placeholder="Titulo do link (opcional)"
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
