"use client";

import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toastError, toastSuccess } from "@/components/app-toast";

const ELAPSED_KEY = "study_timer_elapsed_seconds";
const RUNNING_KEY = "study_timer_running";
const START_KEY = "study_timer_started_at";
const PAUSED_VISIBLE_KEY = "study_timer_pause_visible";
const PAUSED_ELAPSED_KEY = "study_timer_pause_elapsed_seconds";
const PAUSED_START_KEY = "study_timer_pause_started_at";

type SubjectOption = {
  id: string;
  name: string;
};

type TopicOption = {
  id: string;
  title: string;
};

type OpenRegisterDetail = {
  subjectId?: string;
  subjectName?: string;
  topicId?: string;
  topicTitle?: string;
  category?: "THEORY" | "PRACTICE" | "REVIEW" | "MOCK_EXAM";
};

type OpenTimerDetail = {
  subjectId?: string;
  subjectName?: string;
};

type EditRegisterDetail = {
  sessionId: string;
  category: "THEORY" | "PRACTICE" | "REVIEW" | "MOCK_EXAM";
  studyDate: string;
  durationMinutes: number;
  subjectId: string | null;
  subjectName: string;
  topicId: string | null;
  topicTitle: string | null;
  material: string;
  comment: string;
  questionsCorrect: number;
  questionsWrong: number;
  pagesRead: number;
  pagesStart: number | null;
  pagesEnd: number | null;
  videoMinutes: number;
};

type StudyDateMode = "today" | "yesterday" | "custom";

function normalizeText(value: string) {
  return value.trim().toLocaleLowerCase();
}

function toStudyCategory(value: string): "THEORY" | "PRACTICE" | "REVIEW" | "MOCK_EXAM" {
  if (value === "Questões") return "PRACTICE";
  if (value === "Revisão") return "REVIEW";
  if (value === "Simulado") return "MOCK_EXAM";
  return "THEORY";
}

function fromStudyCategory(value: "THEORY" | "PRACTICE" | "REVIEW" | "MOCK_EXAM") {
  if (value === "PRACTICE") return "Questões";
  if (value === "REVIEW") return "Revisão";
  if (value === "MOCK_EXAM") return "Simulado";
  return "Teoria";
}

function toHHMMSSFromSeconds(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function parseHHMMSSToSeconds(value: string) {
  const match = value.trim().match(/^(\d{1,2}):([0-5]\d):([0-5]\d)$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  return hours * 3600 + minutes * 60 + seconds;
}

function maskHHMMSS(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 6);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}:${digits.slice(4)}`;
}

function normalizeClockOrEmpty(value: string) {
  const masked = maskHHMMSS(value);
  return masked;
}

function formatClock(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatDateInput(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const DEFAULT_REVIEW_SCHEDULE_DAYS = ["1", "7", "14", "28", "35"];

export function StudyTimerWidget({ currentPlanId }: { currentPlanId?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [pauseVisible, setPauseVisible] = useState(false);
  const [pausedElapsed, setPausedElapsed] = useState(0);
  const [pauseRunning, setPauseRunning] = useState(false);
  const [studyFormOpen, setStudyFormOpen] = useState(false);
  const [category, setCategory] = useState("Teoria");
  const [subject, setSubject] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [subjectOptions, setSubjectOptions] = useState<SubjectOption[]>([]);
  const [topic, setTopic] = useState("");
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [topicOptions, setTopicOptions] = useState<TopicOption[]>([]);
  const [material, setMaterial] = useState("");
  const [notes, setNotes] = useState("");
  const [studyHoursHHMM, setStudyHoursHHMM] = useState("");
  const [questionsCorrect, setQuestionsCorrect] = useState("");
  const [questionsWrong, setQuestionsWrong] = useState("");
  const [pagesStart, setPagesStart] = useState("");
  const [pagesEnd, setPagesEnd] = useState("");
  const [videoStart, setVideoStart] = useState("");
  const [videoEnd, setVideoEnd] = useState("");
  const [studyDateMode, setStudyDateMode] = useState<StudyDateMode>("today");
  const [studyDate, setStudyDate] = useState(formatDateInput(new Date()));
  const [saving, setSaving] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [resolvedPlanId, setResolvedPlanId] = useState<string>("");
  const [reviewScheduleEnabled, setReviewScheduleEnabled] = useState(false);
  const [reviewScheduleDays, setReviewScheduleDays] = useState<string[]>(DEFAULT_REVIEW_SCHEDULE_DAYS);
  const [reviewScheduleEditorOpen, setReviewScheduleEditorOpen] = useState(false);
  const [reviewScheduleDraftDay, setReviewScheduleDraftDay] = useState("14");

  function openReviewScheduleEditor() {
    setReviewScheduleDraftDay("14");
    setReviewScheduleEditorOpen(true);
  }

  function closeReviewScheduleEditor() {
    setReviewScheduleEditorOpen(false);
    setReviewScheduleDraftDay("14");
  }

  function confirmReviewScheduleDay() {
    const parsed = Number.parseInt(reviewScheduleDraftDay.replace(/\D/g, ""), 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 3650) {
      toastError("Registro de estudo", "Informe um intervalo válido entre 1 e 3650 dias.");
      return;
    }

    const key = String(parsed);
    if (reviewScheduleDays.includes(key)) {
      closeReviewScheduleEditor();
      return;
    }
    const next = [...reviewScheduleDays, key].sort((a, b) => Number(a) - Number(b));
    setReviewScheduleDays(next);
    closeReviewScheduleEditor();
  }

  function removeReviewScheduleDay(value: string) {
    setReviewScheduleDays((prev) => prev.filter((item) => item !== value));
  }

  function setDateMode(mode: StudyDateMode) {
    const now = new Date();
    if (mode === "today") {
      setStudyDateMode("today");
      setStudyDate(formatDateInput(now));
      return;
    }
    if (mode === "yesterday") {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      setStudyDateMode("yesterday");
      setStudyDate(formatDateInput(yesterday));
      return;
    }
    setStudyDateMode("custom");
  }

  useEffect(() => {
    const savedElapsed = Number(window.localStorage.getItem(ELAPSED_KEY) ?? "0");
    const savedRunning = window.localStorage.getItem(RUNNING_KEY) === "1";
    const savedStart = Number(window.localStorage.getItem(START_KEY) ?? "0");
    const savedPauseVisible = window.localStorage.getItem(PAUSED_VISIBLE_KEY) === "1";
    const savedPausedElapsed = Number(window.localStorage.getItem(PAUSED_ELAPSED_KEY) ?? "0");
    const savedPausedStart = Number(window.localStorage.getItem(PAUSED_START_KEY) ?? "0");
    const now = Date.now();

    if (savedRunning && savedStart > 0) {
      const extra = Math.floor((now - savedStart) / 1000);
      setElapsed(savedElapsed + Math.max(0, extra));
      window.localStorage.setItem(ELAPSED_KEY, String(savedElapsed + Math.max(0, extra)));
      window.localStorage.setItem(START_KEY, String(now));
      setRunning(true);
    } else {
      setElapsed(savedElapsed);
      setRunning(savedRunning);
    }

    if (!savedPauseVisible) {
      setPauseVisible(false);
      setPausedElapsed(0);
      return;
    }

    if (!savedRunning && savedPausedStart > 0) {
      const pausedExtra = Math.floor((now - savedPausedStart) / 1000);
      const pauseTotal = savedPausedElapsed + Math.max(0, pausedExtra);
      setPauseVisible(true);
      setPausedElapsed(pauseTotal);
      setPauseRunning(true);
      window.localStorage.setItem(PAUSED_ELAPSED_KEY, String(pauseTotal));
      window.localStorage.setItem(PAUSED_START_KEY, String(now));
      return;
    }

    setPauseVisible(true);
    setPausedElapsed(Math.max(0, savedPausedElapsed));
    setPauseRunning(false);
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1;
        window.localStorage.setItem(ELAPSED_KEY, String(next));
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (!pauseVisible || running || !pauseRunning) return;
    const id = window.setInterval(() => {
      setPausedElapsed((prev) => {
        const next = prev + 1;
        window.localStorage.setItem(PAUSED_ELAPSED_KEY, String(next));
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [pauseVisible, running, pauseRunning]);

  const stopActiveCount = useCallback(() => {
    setRunning(false);
    setPauseRunning(false);
    window.localStorage.setItem(RUNNING_KEY, "0");
    window.localStorage.removeItem(START_KEY);
    window.localStorage.removeItem(PAUSED_START_KEY);
  }, []);

  const applyOpenRegisterDetail = useCallback(
    (detail: OpenRegisterDetail) => {
      const subjectIdFromEvent = detail.subjectId ?? "";
      const subjectNameFromEvent = detail.subjectName ?? "";
      const topicIdFromEvent = detail.topicId ?? "";
      const topicTitleFromEvent = detail.topicTitle ?? "";
      const categoryFromEvent = detail.category;

      stopActiveCount();
      setOpen(false);
      setStudyFormOpen(true);
      setEditingSessionId(null);
      setDateMode("today");
      setStudyHoursHHMM("");
      setCategory(categoryFromEvent ? fromStudyCategory(categoryFromEvent) : "Teoria");
      if (subjectNameFromEvent) setSubject(subjectNameFromEvent);
      if (subjectIdFromEvent) setSelectedSubjectId(subjectIdFromEvent);
      setTopic(topicTitleFromEvent || "");
      setSelectedTopicId(topicIdFromEvent || "");
      setTopicOptions([]);
      setReviewScheduleEnabled(false);
      setReviewScheduleDays(DEFAULT_REVIEW_SCHEDULE_DAYS);
      setReviewScheduleEditorOpen(false);
      setReviewScheduleDraftDay("14");
    },
    [stopActiveCount]
  );

  const getElapsedSnapshot = useCallback(() => {
    const savedElapsed = Number(window.localStorage.getItem(ELAPSED_KEY) ?? String(elapsed));
    const savedRunning = window.localStorage.getItem(RUNNING_KEY) === "1";
    const savedStart = Number(window.localStorage.getItem(START_KEY) ?? "0");

    if (savedRunning && savedStart > 0) {
      const extra = Math.floor((Date.now() - savedStart) / 1000);
      return savedElapsed + Math.max(0, extra);
    }

    return Math.max(0, Math.max(savedElapsed, elapsed));
  }, [elapsed]);

  const openStudyForm = useCallback(() => {
    const elapsedSnapshot = getElapsedSnapshot();
    stopActiveCount();
    setOpen(false);
    setDateMode("today");
    setStudyHoursHHMM(toHHMMSSFromSeconds(elapsedSnapshot));
    setReviewScheduleEnabled(false);
    setReviewScheduleDays(DEFAULT_REVIEW_SCHEDULE_DAYS);
    setReviewScheduleEditorOpen(false);
    setReviewScheduleDraftDay("14");
    setStudyFormOpen(true);
  }, [getElapsedSnapshot, stopActiveCount]);

  const resetTimer = useCallback(() => {
    setRunning(false);
    setElapsed(0);
    setPauseVisible(false);
    setPausedElapsed(0);
    window.localStorage.setItem(RUNNING_KEY, "0");
    window.localStorage.setItem(ELAPSED_KEY, "0");
    window.localStorage.setItem(PAUSED_VISIBLE_KEY, "0");
    window.localStorage.setItem(PAUSED_ELAPSED_KEY, "0");
    window.localStorage.removeItem(START_KEY);
    window.localStorage.removeItem(PAUSED_START_KEY);
  }, []);

  const requestCloseTimer = useCallback(() => {
    // Leaving timer screen must stop all counters.
    stopActiveCount();

    const hasAnyTime = elapsed > 0 || pausedElapsed > 0;
    if (!hasAnyTime) {
      setOpen(false);
      return;
    }

    const shouldAddStudy = window.confirm("Deseja adicionar este tempo ao estudo antes de sair?");
    if (shouldAddStudy) {
      openStudyForm();
      return;
    }

    resetTimer();
    setOpen(false);
  }, [elapsed, pausedElapsed, openStudyForm, resetTimer, stopActiveCount]);

  useEffect(() => {
    if (!open && !studyFormOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && reviewScheduleEditorOpen) {
        closeReviewScheduleEditor();
        return;
      }
      if (event.key === "Escape" && studyFormOpen) {
        setStudyFormOpen(false);
        return;
      }
      if (event.key === "Escape" && open) requestCloseTimer();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, studyFormOpen, reviewScheduleEditorOpen, requestCloseTimer]);

  useEffect(() => {
    function handleOpenTimer(event: Event) {
      const customEvent = event as CustomEvent<OpenTimerDetail>;
      const subjectIdFromEvent = customEvent.detail?.subjectId ?? "";
      const subjectNameFromEvent = customEvent.detail?.subjectName ?? "";

      if (subjectNameFromEvent) setSubject(subjectNameFromEvent);
      if (subjectIdFromEvent) setSelectedSubjectId(subjectIdFromEvent);
      setStudyFormOpen(false);
      setOpen(true);
    }

    window.addEventListener("study-timer:open-timer", handleOpenTimer as EventListener);
    return () => {
      window.removeEventListener("study-timer:open-timer", handleOpenTimer as EventListener);
    };
  }, []);

  useEffect(() => {
    function handleOpenRegister(event: Event) {
      const customEvent = event as CustomEvent<OpenRegisterDetail>;
      applyOpenRegisterDetail(customEvent.detail ?? {});
    }

    window.addEventListener("study-timer:open-register", handleOpenRegister as EventListener);
    return () => {
      window.removeEventListener("study-timer:open-register", handleOpenRegister as EventListener);
    };
  }, [applyOpenRegisterDetail]);

  useEffect(() => {
    const shouldOpenRegister = searchParams.get("openRegister") === "1" || searchParams.get("newSession") === "1";
    if (!shouldOpenRegister) return;

    const detail: OpenRegisterDetail = {
      subjectId: searchParams.get("subjectId") ?? undefined,
      subjectName: searchParams.get("subjectName") ?? undefined,
      topicId: searchParams.get("topicId") ?? undefined,
      topicTitle: searchParams.get("topicTitle") ?? undefined,
      category: (() => {
        const raw = (searchParams.get("registerCategory") ?? "").toUpperCase();
        if (raw === "THEORY" || raw === "PRACTICE" || raw === "REVIEW" || raw === "MOCK_EXAM") return raw;
        return undefined;
      })()
    };

    applyOpenRegisterDetail(detail);

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("openRegister");
      url.searchParams.delete("newSession");
      url.searchParams.delete("registerCategory");
      url.searchParams.delete("subjectId");
      url.searchParams.delete("subjectName");
      url.searchParams.delete("topicId");
      url.searchParams.delete("topicTitle");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, [applyOpenRegisterDetail, pathname, searchParams]);

  useEffect(() => {
    function handleEditRegister(event: Event) {
      const customEvent = event as CustomEvent<EditRegisterDetail>;
      const detail = customEvent.detail;
      if (!detail?.sessionId) return;

      stopActiveCount();
      setOpen(false);
      setStudyFormOpen(true);
      setEditingSessionId(detail.sessionId);
      setCategory(fromStudyCategory(detail.category));
      setStudyDateMode("custom");
      setStudyDate(detail.studyDate.slice(0, 10));
      setStudyHoursHHMM(toHHMMSSFromSeconds(Math.max(0, detail.durationMinutes) * 60));
      setSubject(detail.subjectName || "");
      setSelectedSubjectId(detail.subjectId ?? "");
      setTopic(detail.topicTitle ?? "");
      setSelectedTopicId(detail.topicId ?? "");
      setMaterial(detail.material ?? "");
      setNotes(detail.comment ?? "");
      setQuestionsCorrect(String(Math.max(0, detail.questionsCorrect || 0)));
      setQuestionsWrong(String(Math.max(0, detail.questionsWrong || 0)));
      if (detail.pagesStart && detail.pagesEnd && detail.pagesStart > 0 && detail.pagesEnd >= detail.pagesStart) {
        setPagesStart(String(detail.pagesStart));
        setPagesEnd(String(detail.pagesEnd));
      } else {
        setPagesStart(detail.pagesRead > 0 ? "1" : "");
        setPagesEnd(detail.pagesRead > 0 ? String(detail.pagesRead) : "");
      }
      setVideoStart(detail.videoMinutes > 0 ? "00:00:00" : "");
      setVideoEnd(detail.videoMinutes > 0 ? toHHMMSSFromSeconds(detail.videoMinutes * 60) : "");
      setReviewScheduleEnabled(false);
      setReviewScheduleDays(DEFAULT_REVIEW_SCHEDULE_DAYS);
      setReviewScheduleEditorOpen(false);
      setReviewScheduleDraftDay("14");
    }

    window.addEventListener("study-timer:edit-register", handleEditRegister as EventListener);
    return () => {
      window.removeEventListener("study-timer:edit-register", handleEditRegister as EventListener);
    };
  }, [stopActiveCount]);

  useEffect(() => {
    if (!studyFormOpen) return;
    let cancelled = false;

    async function loadSubjects() {
      try {
        const planQuery = currentPlanId ? `?planId=${encodeURIComponent(currentPlanId)}` : "";
        const response = await fetch(`/api/subjects${planQuery}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { subjects?: Array<{ id: string; name: string }> };
        if (cancelled) return;
        setSubjectOptions(Array.isArray(payload.subjects) ? payload.subjects.map((item) => ({ id: item.id, name: item.name })) : []);
      } catch {
        if (!cancelled) setSubjectOptions([]);
      }
    }

    void loadSubjects();
    return () => {
      cancelled = true;
    };
  }, [studyFormOpen, currentPlanId]);

  useEffect(() => {
    if (!studyFormOpen) return;
    const normalized = normalizeText(subject);
    if (!normalized) {
      setSelectedSubjectId("");
      setTopic("");
      setSelectedTopicId("");
      setTopicOptions([]);
      return;
    }

    // Keep preselected subjectId (coming from "Registrar estudo") until options are loaded.
    if (subjectOptions.length === 0) return;

    const matchedSubject = subjectOptions.find((item) => normalizeText(item.name) === normalized);
    const nextSubjectId = matchedSubject?.id ?? "";
    if (nextSubjectId === selectedSubjectId) return;

    setSelectedSubjectId(nextSubjectId);
    setTopic("");
    setSelectedTopicId("");
    setTopicOptions([]);
  }, [studyFormOpen, subject, subjectOptions, selectedSubjectId]);

  useEffect(() => {
    if (!studyFormOpen || !selectedSubjectId) return;
    let cancelled = false;

    async function loadTopics() {
      try {
        const response = await fetch(`/api/topics?subjectId=${encodeURIComponent(selectedSubjectId)}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { topics?: Array<{ id: string; title: string }> };
        if (cancelled) return;
        setTopicOptions(Array.isArray(payload.topics) ? payload.topics.map((item) => ({ id: item.id, title: item.title })) : []);
      } catch {
        if (!cancelled) setTopicOptions([]);
      }
    }

    void loadTopics();
    return () => {
      cancelled = true;
    };
  }, [studyFormOpen, selectedSubjectId]);

  useEffect(() => {
    if (!studyFormOpen || !selectedSubjectId || currentPlanId) return;
    let cancelled = false;

    async function resolvePlanBySubject() {
      try {
        const response = await fetch(`/api/subjects/${encodeURIComponent(selectedSubjectId)}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { subject?: { planId?: string } };
        if (cancelled) return;
        setResolvedPlanId(payload.subject?.planId ?? "");
      } catch {
        if (!cancelled) setResolvedPlanId("");
      }
    }

    void resolvePlanBySubject();
    return () => {
      cancelled = true;
    };
  }, [studyFormOpen, selectedSubjectId, currentPlanId]);

  useEffect(() => {
    const normalized = normalizeText(topic);
    if (!normalized || topicOptions.length === 0) {
      setSelectedTopicId("");
      return;
    }

    const matchedTopic = topicOptions.find((item) => normalizeText(item.title) === normalized);
    setSelectedTopicId(matchedTopic?.id ?? "");
  }, [topic, topicOptions]);

  function startTimer() {
    const now = Date.now();
    setRunning(true);
    setPauseRunning(false);
    window.localStorage.setItem(RUNNING_KEY, "1");
    window.localStorage.setItem(START_KEY, String(now));
    window.localStorage.removeItem(PAUSED_START_KEY);
  }

  function pauseTimerOnly() {
    if (!running) {
      setRunning(false);
      window.localStorage.setItem(RUNNING_KEY, "0");
      window.localStorage.removeItem(START_KEY);
      return;
    }

    const now = Date.now();
    setRunning(false);
    setPauseVisible(true);
    setPauseRunning(true);
    window.localStorage.setItem(RUNNING_KEY, "0");
    window.localStorage.removeItem(START_KEY);
    window.localStorage.setItem(PAUSED_VISIBLE_KEY, "1");
    window.localStorage.setItem(PAUSED_START_KEY, String(now));
  }

  function stopAndOpenStudyForm() {
    const elapsedSnapshot = getElapsedSnapshot();
    if (running) {
      setRunning(false);
      window.localStorage.setItem(RUNNING_KEY, "0");
      window.localStorage.removeItem(START_KEY);
    }
    setPauseRunning(false);
    window.localStorage.removeItem(PAUSED_START_KEY);
    setOpen(false);
    setDateMode("today");
    setStudyHoursHHMM(toHHMMSSFromSeconds(elapsedSnapshot));
    setReviewScheduleEnabled(false);
    setReviewScheduleDays(DEFAULT_REVIEW_SCHEDULE_DAYS);
    closeReviewScheduleEditor();
    setStudyFormOpen(true);
  }

  async function saveStudyLog() {
    const durationSeconds = parseHHMMSSToSeconds(studyHoursHHMM);
    if (durationSeconds === null) {
      toastError("Registro de estudo", "Informe horas de estudo no formato hh:mm:ss.");
      return;
    }
    if (!studyDate) {
      toastError("Registro de estudo", "Informe a data do estudo.");
      return;
    }

    const correct = Number.parseInt(questionsCorrect || "0", 10);
    const wrong = Number.parseInt(questionsWrong || "0", 10);
    const hasAnyPageValue = pagesStart.trim() !== "" || pagesEnd.trim() !== "";
    const startPage = Number.parseInt(pagesStart || "0", 10);
    const endPage = Number.parseInt(pagesEnd || "0", 10);
    if (hasAnyPageValue && (!Number.isFinite(startPage) || !Number.isFinite(endPage) || startPage < 1 || endPage < startPage)) {
      toastError("Registro de estudo", "Preencha páginas no formato válido (início e fim, com fim maior ou igual ao início).");
      return;
    }
    const pagesRead = hasAnyPageValue ? endPage - startPage + 1 : 0;
    const startVideoSeconds = parseHHMMSSToSeconds(videoStart);
    const endVideoSeconds = parseHHMMSSToSeconds(videoEnd);
    const hasAnyVideoValue = videoStart.trim() !== "" || videoEnd.trim() !== "";
    if (
      hasAnyVideoValue &&
      (startVideoSeconds === null || endVideoSeconds === null || endVideoSeconds < startVideoSeconds)
    ) {
      toastError("Registro de estudo", "Preencha videoaulas no formato hh:mm:ss (início e fim válidos).");
      return;
    }
    const videoMinutes =
      hasAnyVideoValue && startVideoSeconds !== null && endVideoSeconds !== null ? Math.floor((endVideoSeconds - startVideoSeconds) / 60) : 0;
    const normalizedReviewScheduleDays = reviewScheduleDays
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isFinite(value) && value > 0 && value <= 3650);
    const reviewSchedulePayload = Array.from(new Set(normalizedReviewScheduleDays)).sort((a, b) => a - b);
    if (reviewScheduleEnabled && !selectedTopicId) {
      toastError("Registro de estudo", "Para lançar revisões programadas, selecione um tópico.");
      return;
    }
    if (reviewScheduleEnabled && reviewSchedulePayload.length === 0) {
      toastError("Registro de estudo", "Informe ao menos um intervalo válido de revisão (em dias).");
      return;
    }
    const [year, month, day] = studyDate.split("-").map((part) => Number(part));
    const startedAt = new Date(year, (month || 1) - 1, day || 1, 12, 0, 0);
    const endedAt = new Date(startedAt.getTime() + durationSeconds * 1000);
    const metadataTokens: string[] = [];
    if (hasAnyPageValue) {
      metadataTokens.push(`pagesStart=${startPage}`);
      metadataTokens.push(`pagesEnd=${endPage}`);
    }
    const metaLine = metadataTokens.length > 0 ? `@meta ${metadataTokens.join(" ")}` : "";
    const mergedNotes = [material.trim() ? `Material: ${material.trim()}` : "", metaLine, notes.trim()].filter(Boolean).join("\n");

    try {
      setSaving(true);
      const endpoint = editingSessionId ? `/api/study-sessions/${editingSessionId}` : "/api/study-sessions";
      const method = editingSessionId ? "PATCH" : "POST";
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: currentPlanId || resolvedPlanId || undefined,
          subjectId: selectedSubjectId || (editingSessionId ? null : undefined),
          topicId: selectedTopicId || (editingSessionId ? null : undefined),
          category: toStudyCategory(category),
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
          durationMinutes: Math.max(0, Math.floor(durationSeconds / 60)),
          questionsCorrect: Number.isFinite(correct) && correct > 0 ? correct : 0,
          questionsWrong: Number.isFinite(wrong) && wrong > 0 ? wrong : 0,
          pagesRead,
          videoMinutes,
          notes: mergedNotes || undefined,
          reviewScheduleEnabled: reviewScheduleEnabled && !editingSessionId,
          reviewScheduleDays: reviewScheduleEnabled && !editingSessionId ? reviewSchedulePayload : undefined
        })
      });

      if (!response.ok) {
        toastError("Registro de estudo", "Não foi possível salvar o registro de estudo no banco.");
        return;
      }

      toastSuccess("Registro de estudo", editingSessionId ? "Registro atualizado com sucesso." : "Registro salvo com sucesso.");

      setStudyFormOpen(false);
      setEditingSessionId(null);
      resetTimer();
      setCategory("Teoria");
      setSubject("");
      setSelectedSubjectId("");
      setSubjectOptions([]);
      setTopic("");
      setSelectedTopicId("");
      setTopicOptions([]);
      setMaterial("");
      setNotes("");
      setStudyHoursHHMM("");
      setQuestionsCorrect("");
      setQuestionsWrong("");
      setPagesStart("");
      setPagesEnd("");
      setVideoStart("");
      setVideoEnd("");
      setResolvedPlanId("");
      setReviewScheduleEnabled(false);
      setReviewScheduleDays(DEFAULT_REVIEW_SCHEDULE_DAYS);
      closeReviewScheduleEditor();
      setDateMode("today");

      if (window.location.pathname.startsWith("/disciplinas/")) {
        window.location.reload();
      }
    } finally {
      setSaving(false);
    }
  }

  function cancelStudyRegister() {
    setStudyFormOpen(false);
    setEditingSessionId(null);
    resetTimer();
    setCategory("Teoria");
    setSubject("");
    setSelectedSubjectId("");
    setSubjectOptions([]);
    setTopic("");
    setSelectedTopicId("");
    setTopicOptions([]);
    setMaterial("");
    setNotes("");
    setStudyHoursHHMM("");
    setQuestionsCorrect("");
    setQuestionsWrong("");
    setPagesStart("");
    setPagesEnd("");
    setVideoStart("");
    setVideoEnd("");
    setResolvedPlanId("");
    setReviewScheduleEnabled(false);
    setReviewScheduleDays(DEFAULT_REVIEW_SCHEDULE_DAYS);
    closeReviewScheduleEditor();
    setDateMode("today");
  }

  return (
    <div className="studyTimerRoot">
      <button className="studyTimerFab" type="button" aria-label="Cronômetro de estudo" onClick={() => setOpen((prev) => !prev)}>
        ⏱
      </button>

      {open ? (
        <div className="studyTimerOverlay" onClick={requestCloseTimer}>
          <section className="studyTimerModal" aria-label="Painel de cronômetro" aria-modal="true" role="dialog" onClick={(e) => e.stopPropagation()}>
            <button className="studyTimerClose" type="button" aria-label="Fechar cronômetro" onClick={requestCloseTimer}>
              ✕
            </button>
            <div className="studyTimerHero">
              <div className="studyTimerBrandRow">
                <Image className="studyTimerBrandMark" src="/brand/logo-gabarita-mark.svg" alt="Gabarita" width={52} height={52} />
                <span className="studyTimerBrandText">gabarita</span>
              </div>
              <p>Contabilize e registre seus estudos!</p>
            </div>
            <div className="studyTimerBar" />
            <p className="studyTimerValue">{formatClock(elapsed)}</p>
            <p className="studyTimerLabel">CRONOMETRO</p>
            <div className="studyTimerActions">
              {running ? (
                <button className="studyTimerCircleBtn" type="button" onClick={pauseTimerOnly} aria-label="Pausar">
                  ❚❚
                </button>
              ) : (
                <button className="studyTimerCircleBtn" type="button" onClick={startTimer} aria-label="Iniciar">
                  ▶
                </button>
              )}
              <button className="studyTimerCircleBtn secondary" type="button" onClick={stopAndOpenStudyForm} aria-label="Parar e abrir registro">
                ■
              </button>
            </div>

            {pauseVisible ? (
              <div className="studyTimerMiniWrap">
                <p className="studyTimerMiniTitle">Tempo pausado</p>
                <div className="studyTimerMiniItem">
                  <span>contador do pause</span>
                  <strong>{formatClock(pausedElapsed)}</strong>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {studyFormOpen ? (
        <div className="studyTimerOverlay" onClick={() => setStudyFormOpen(false)}>
          <section className="studyTimerRegisterModal" aria-label="Registro de estudo" aria-modal="true" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="studyTimerRegisterHeader">
              <h3>{editingSessionId ? "Editar registro de estudo" : "Registro de estudo"}</h3>
              <button className="studyTimerClose" type="button" aria-label="Fechar registro" onClick={() => setStudyFormOpen(false)}>
                ✕
              </button>
            </div>

            <div className="studyTimerDateModeRow">
              <button
                className={`studyTimerDateModeBtn ${studyDateMode === "today" ? "active" : ""}`}
                type="button"
                onClick={() => setDateMode("today")}
              >
                Hoje
              </button>
              <button
                className={`studyTimerDateModeBtn ${studyDateMode === "yesterday" ? "active" : ""}`}
                type="button"
                onClick={() => setDateMode("yesterday")}
              >
                Ontem
              </button>
              <button
                className={`studyTimerDateModeBtn ${studyDateMode === "custom" ? "active" : ""}`}
                type="button"
                onClick={() => setDateMode("custom")}
              >
                Outro
              </button>
            </div>

            {studyDateMode === "custom" ? (
              <label className="studyTimerCustomDateField">
                Data do estudo
                <input className="input" type="date" value={studyDate} onChange={(e) => setStudyDate(e.target.value)} />
              </label>
            ) : null}

            <div className="studyTimerRegisterGrid">
              <label>
                Categoria
                <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="Teoria">Teoria</option>
                  <option value="Questões">Questões</option>
                  <option value="Revisão">Revisão</option>
                  <option value="Simulado">Simulado</option>
                </select>
              </label>

              <label>
                Disciplina
                <input
                  className="input"
                  list="study-register-subjects"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Digite para sugerir disciplinas do plano"
                />
                <datalist id="study-register-subjects">
                  {subjectOptions.map((item) => (
                    <option key={item.id} value={item.name} />
                  ))}
                </datalist>
              </label>

              <label>
                Tópico
                <input
                  className="input"
                  list="study-register-topics"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder={selectedSubjectId ? "Digite para sugerir tópicos da disciplina" : "Selecione a disciplina para sugerir tópicos"}
                />
                <datalist id="study-register-topics">
                  {topicOptions.map((item) => (
                    <option key={item.id} value={item.title} />
                  ))}
                </datalist>
              </label>

              <label>
                Material
                <input className="input" value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="Ex.: Aula 01" />
              </label>

              <div className="studyTimerMetricsGrid">
                <label>
                  Horas de estudo (hh:mm:ss)
                  <input
                    className="input"
                    value={studyHoursHHMM}
                    onChange={(e) => setStudyHoursHHMM(normalizeClockOrEmpty(e.target.value))}
                    onBlur={(e) => setStudyHoursHHMM(maskHHMMSS(e.target.value))}
                    placeholder="00:00:00"
                    inputMode="numeric"
                    maxLength={8}
                    pattern="[0-9]{2}:[0-9]{2}:[0-9]{2}"
                  />
                </label>

                <div className="studyTimerMetricGroup">
                  <span>Videoaulas (início / fim)</span>
                  <div className="studyTimerMetricRow">
                    <input
                      className="input"
                      value={videoStart}
                      onChange={(e) => setVideoStart(normalizeClockOrEmpty(e.target.value))}
                      placeholder="00:00:00"
                      inputMode="numeric"
                      maxLength={8}
                    />
                    <input
                      className="input"
                      value={videoEnd}
                      onChange={(e) => setVideoEnd(normalizeClockOrEmpty(e.target.value))}
                      placeholder="00:00:00"
                      inputMode="numeric"
                      maxLength={8}
                    />
                  </div>
                </div>

                <div className="studyTimerMetricGroup">
                  <span>Questões (acertos / erros)</span>
                  <div className="studyTimerMetricRow">
                    <input
                      className="input"
                      type="number"
                      min={0}
                      value={questionsCorrect}
                      onChange={(e) => setQuestionsCorrect(e.target.value.replace(/\D/g, ""))}
                      placeholder="Acertos"
                    />
                    <input
                      className="input"
                      type="number"
                      min={0}
                      value={questionsWrong}
                      onChange={(e) => setQuestionsWrong(e.target.value.replace(/\D/g, ""))}
                      placeholder="Erros"
                    />
                  </div>
                </div>

                <div className="studyTimerMetricGroup">
                  <span>Páginas (início / fim)</span>
                  <div className="studyTimerMetricRow">
                    <input
                      className="input"
                      type="number"
                      min={1}
                      value={pagesStart}
                      onChange={(e) => setPagesStart(e.target.value.replace(/\D/g, ""))}
                      placeholder="Início"
                    />
                    <input
                      className="input"
                      type="number"
                      min={1}
                      value={pagesEnd}
                      onChange={(e) => setPagesEnd(e.target.value.replace(/\D/g, ""))}
                      placeholder="Fim"
                    />
                  </div>
                </div>
              </div>
            </div>

            <label>
              Comentários
              <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações rápidas do estudo" />
            </label>

            {!editingSessionId ? (
              <div className="studyTimerReviewScheduleBlock">
                <label className="studyTimerReviewScheduleToggle">
                  <input
                    type="checkbox"
                    checked={reviewScheduleEnabled}
                    onChange={(e) => {
                      setReviewScheduleEnabled(e.target.checked);
                      if (!e.target.checked) closeReviewScheduleEditor();
                    }}
                  />
                  Lançar revisões programadas para este estudo
                </label>
                {reviewScheduleEnabled ? (
                  <div className="studyTimerReviewScheduleFields">
                    <p>Intervalos (dias)</p>
                    <div className="studyTimerReviewScheduleChips">
                      {reviewScheduleDays.map((value) => (
                        <button
                          key={`review-day-${value}`}
                          type="button"
                          className="studyTimerReviewChip"
                          onClick={() => removeReviewScheduleDay(value)}
                          aria-label={`Remover intervalo ${value} dias`}
                          title={`Remover ${value}d`}
                        >
                          {value}d <span>×</span>
                        </button>
                      ))}
                      <button type="button" className="studyTimerReviewChipAdd" onClick={openReviewScheduleEditor} aria-label="Adicionar intervalo">
                        +
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {reviewScheduleEditorOpen ? (
              <div className="studyTimerReviewScheduleFloatingOverlay" role="presentation" onClick={closeReviewScheduleEditor}>
                <section
                  className="studyTimerReviewScheduleFloatingModal"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Novo intervalo de revisão"
                  onClick={(event) => event.stopPropagation()}
                >
                  <button className="studyTimerClose" type="button" aria-label="Fechar novo intervalo" onClick={closeReviewScheduleEditor}>
                    ✕
                  </button>
                  <h4>Nova revisão</h4>
                  <form
                    className="studyTimerReviewScheduleEditorForm"
                    onSubmit={(event) => {
                      event.preventDefault();
                      confirmReviewScheduleDay();
                    }}
                  >
                    <label>
                      Intervalo (dias)
                      <input
                        className="input"
                        type="number"
                        min={1}
                        max={3650}
                        value={reviewScheduleDraftDay}
                        onChange={(event) => setReviewScheduleDraftDay(event.target.value.replace(/\D/g, "").slice(0, 4))}
                        autoFocus
                      />
                    </label>
                    <div className="studyTimerReviewScheduleEditorActions">
                      <button type="button" className="ghostButton" onClick={closeReviewScheduleEditor}>
                        Cancelar
                      </button>
                      <button type="submit" className="button small">
                        Salvar
                      </button>
                    </div>
                  </form>
                </section>
              </div>
            ) : null}

            <div className="studyTimerRegisterSummary">
              <p>Tempo de estudo: <strong>{studyHoursHHMM || "--:--:--"}</strong></p>
              <p>Total: <strong>{studyHoursHHMM || "--:--:--"}</strong></p>
            </div>

            <div className="studyTimerRegisterActions">
              <button className="secondaryBtn" type="button" onClick={cancelStudyRegister}>
                Cancelar
              </button>
              <button className="button" type="button" onClick={saveStudyLog} disabled={saving}>
                {saving ? "Salvando..." : editingSessionId ? "Salvar edição" : "Salvar estudo"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
