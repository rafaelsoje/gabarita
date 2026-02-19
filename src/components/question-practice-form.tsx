"use client";

import { FormEvent, useState } from "react";
import { toastError } from "@/components/app-toast";

type QuestionOptionItem = {
  id: string;
  label: string;
  text: string;
};

type QuestionFeedback = {
  isCorrect: boolean;
  correctLabel: string;
  whyCorrect: string;
  whyWrong: string;
  selectedLabel: string;
};

type QuestionPracticeFormProps = {
  questionId: string;
  options: QuestionOptionItem[];
};

type DetailedSection = {
  title: string;
  body: string;
};

type AssertionItem = {
  label: string;
  text: string;
};

function extractDetailedSections(text: string): DetailedSection[] {
  const source = text.trim();
  if (!source) return [];

  const markerRegex = /(Resposta correta|An[aá]lise detalhada|Fundamento t[eé]cnico|Pegadinha comum)\s*:/gi;
  const matches = Array.from(source.matchAll(markerRegex));
  if (matches.length === 0) return [{ title: "Comentário", body: source }];

  const sections: DetailedSection[] = [];
  for (let i = 0; i < matches.length; i += 1) {
    const current = matches[i];
    const next = matches[i + 1];
    const title = String(current[1] ?? "").trim();
    const start = (current.index ?? 0) + current[0].length;
    const end = next?.index ?? source.length;
    const body = source.slice(start, end).trim();
    if (!title || !body) continue;
    sections.push({ title, body });
  }

  return sections.length > 0 ? sections : [{ title: "Comentário", body: source }];
}

function splitRomanAssertions(text: string): AssertionItem[] {
  const source = text.trim();
  const markerRegex = /\b([IVXLCDM]{1,6})(?:\s*(?:[.)]|[-–—:]))?\s+(?=[A-Za-zÀ-ÿ(])/g;
  const markers = Array.from(source.matchAll(markerRegex));
  if (markers.length < 2) return [];

  const items: AssertionItem[] = [];
  for (let i = 0; i < markers.length; i += 1) {
    const current = markers[i];
    const next = markers[i + 1];
    const label = String(current[1] ?? "").trim();
    const start = (current.index ?? 0) + current[0].length;
    const end = next?.index ?? source.length;
    const body = source.slice(start, end).trim().replace(/[;,\s]+$/, "");
    if (!label || !body) continue;
    items.push({ label, text: body });
  }

  return items;
}

export function QuestionPracticeForm({ questionId, options }: QuestionPracticeFormProps) {
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<QuestionFeedback | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOptionId) {
      toastError("Questão", "Selecione uma alternativa.");
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/questions/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, selectedOptionId })
      });

      if (response.status === 401) {
        window.location.href = "/entrar";
        return;
      }

      const payload = (await response.json().catch(() => null)) as { message?: string; result?: QuestionFeedback } | null;
      if (!response.ok || !payload?.result) {
        toastError("Questão", payload?.message ?? "Não foi possível responder.");
        return;
      }

      setFeedback(payload.result);
    } catch {
      toastError("Questão", "Falha ao enviar resposta.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="questionAnswerForm">
        <div className="questionOptionsGrid">
          {options.map((option) => (
            <label key={option.id} className="questionOptionRow">
              <input
                type="radio"
                name={`selectedOptionId-${questionId}`}
                value={option.id}
                checked={selectedOptionId === option.id}
                onChange={() => setSelectedOptionId(option.id)}
                disabled={pending}
              />
              <span>
                <b>{option.label})</b> {option.text}
              </span>
            </label>
          ))}
        </div>

        <button className="secondaryBtn" type="submit" disabled={pending || !selectedOptionId}>
          {pending ? "Respondendo..." : "Responder"}
        </button>
      </form>

      {feedback ? (
        <div className={`questionFeedback ${feedback.isCorrect ? "ok" : "err"}`}>
          <p>
            Última resposta: {feedback.isCorrect ? "Correta" : "Incorreta"}. Gabarito: <b>{feedback.correctLabel}</b>
          </p>
          <div className="questionDetailedComment">
            <b>Comentário do gabarito:</b>
            <div className="questionDetailedSections">
              {extractDetailedSections(feedback.whyCorrect).map((section, sectionIndex) => {
                const assertions = /an[aá]lise detalhada/i.test(section.title) ? splitRomanAssertions(section.body) : [];
                return (
                  <section key={`${questionId}-${section.title}-${sectionIndex}`} className="questionDetailedSection">
                    <p>
                      <b>{section.title}:</b>
                    </p>
                    {assertions.length > 0 ? (
                      <ul className="questionAssertions questionFeedbackAssertions">
                        {assertions.map((item) => (
                          <li key={`${questionId}-${section.title}-${item.label}`}>
                            <b>{item.label}</b> {item.text}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>{section.body}</p>
                    )}
                  </section>
                );
              })}
            </div>
          </div>
          {feedback.isCorrect ? (
            <p>
              Sua alternativa: <b>{feedback.selectedLabel || "Em branco"}</b>.
            </p>
          ) : (
            <>
              <p>
                Sua alternativa: <b>{feedback.selectedLabel || "Em branco"}</b>.
              </p>
              <p>Erro comum: {feedback.whyWrong}</p>
            </>
          )}
        </div>
      ) : null}
    </>
  );
}
