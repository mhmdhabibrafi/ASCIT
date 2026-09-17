"use client";

import {
  Activity,
  AlertTriangle,
  Lightbulb,
  Bot,
  Cpu,
  Download,
  ExternalLink,
  Gauge,
  HardDrive,
  Loader2,
  MemoryStick,
  RefreshCw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  StopCircle,
  Wrench,
  Zap,
  CheckCircle2,
  Play,
  RotateCcw
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/form";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader, PageStack } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { formatDateTime, humanizeEnum } from "@/lib/utils";

type MasterData = {
  units?: Array<{ id: string; name: string }>;
  categories?: Array<{ id: string; name: string }>;
};

type RecommendationDetail = {
  id?: string;
  factor: string;
  scoreImpact: number;
  message: string;
};

type Recommendation = {
  id: string;
  score: number;
  scoreStatus: string;
  recommendationTypes: string[];
  priority?: string;
  recommendation: string;
  reason: string;
  nextYearPlan?: string | null;
  openModelSucceeded: boolean;
  openModelErrorMessage?: string | null;
  details?: RecommendationDetail[];
  asset: {
    id: string;
    assetCode: string;
    assetName: string;
    processor?: string | null;
    ram?: string | null;
    storage?: string | null;
    operatingSystem?: string | null;
    _count?: { serviceRecords?: number };
    unit?: { name?: string | null } | null;
    category?: { name?: string | null } | null;
  };
};

type AiJob = {
  id: string;
  assetId: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
  priority: number;
  attempts: number;
  error?: string | null;
  errorMessage?: string | null;
  inferenceDurationMs?: number | null;
  startedAt?: string | null;
  completedAt?: string | null;
};

type AiRun = {
  id: string;
  runCode: string;
  createdAt: string;
  mode?: "FAST" | "RECOMMENDED" | "FULL";
  analysisMode?: "FAST" | "RECOMMENDED" | "FULL";
  provider?: string | null;
  model?: string | null;
  totalAssets?: number;
  processedAssets?: number;
  status?: string;
  aiQueuedCount?: number;
  aiCompletedCount?: number;
  aiFailedCount?: number;
  currentAsset?: string | null;
  summary?: string | null;
  executiveSummary?: string | null;
  jobs?: AiJob[];
  recommendations: Recommendation[];
};

type Filters = {
  year: string;
  unitId: string;
  categoryId: string;
};

type AnalysisMode = "FAST" | "RECOMMENDED" | "FULL";

type AiPreview = {
  mode: AnalysisMode;
  threshold: number | null;
  matchingAssets: number;
  assetsToEvaluate: number;
  eligibleAiAssets: number;
  dataQualityWarningAssets: number;
  estimatedDurationMs: number | null;
  avgInferenceDurationMs: number | null;
  queueAhead: number;
  capped: boolean;
};

const metricConfig = [
  { label: "Processor", type: "UPGRADE_PROCESSOR", icon: Cpu, tone: "info" },
  { label: "RAM", type: "UPGRADE_RAM", icon: MemoryStick, tone: "success" },
  { label: "Storage", type: "UPGRADE_STORAGE", icon: HardDrive, tone: "info" },
  { label: "Penggantian", status: "PRIORITAS_PENGGANTIAN", icon: ShieldAlert, tone: "danger" },
  { label: "OS", type: "UPDATE_OS", icon: RefreshCw, tone: "warning" }
] as const;

const scoringFactors = [
  { label: "Umur aset", value: "+30", description: "Aset lebih dari 5 tahun masuk risiko penggantian." },
  { label: "Processor lama", value: "+25", description: "Pentium, Celeron, Core 2, atau generasi lama." },
  { label: "RAM rendah", value: "+20", description: "RAM di bawah 8 GB untuk perangkat kerja." },
  { label: "Storage HDD", value: "+15", description: "Media penyimpanan belum SSD." },
  { label: "Riwayat repair", value: "+25", description: "Perbaikan berulang menaikkan prioritas tindakan." },
  { label: "Kondisi aset", value: "+30", description: "Rusak berat atau layak ganti menjadi sinyal kritis." }
];

const statusColors: Record<string, string> = {
  AMAN: "#059669",
  PERLU_DIPANTAU: "#d97706",
  DIREKOMENDASIKAN_UPGRADE: "#0d9488",
  PRIORITAS_PENGGANTIAN: "#dc2626"
};

function FormattedExecutiveSummary({ text }: { text: string }) {
  if (!text) return null;

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  const parseBold = (content: string) => {
    const parts = content.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        const value = part.slice(2, -2).trim();
        const isMetric = /^\d+(?:[.,]\d+)?(?:\/\d+)?(?:\s*(?:unit|aset|%))?$/i.test(value);
        if (isMetric) {
          return (
            <strong key={i} className="mx-0.5 inline-flex whitespace-nowrap rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-bold text-emerald-800">
              {value}
            </strong>
          );
        }
        return (
          <strong key={i} className="font-semibold text-emerald-800">
            {value}
          </strong>
        );
      }
      return part;
    });
  };

  return (
    <div className="grid gap-3">
      {lines.map((line, idx) => {
        if (line.startsWith("###")) {
          const title = line.replace(/^###\s*/, "");
          return (
            <h4 key={idx} className="mb-1 flex items-center gap-2 border-b border-slate-200 pb-3 text-base font-bold text-slate-900">
              <Sparkles className="h-5 w-5 text-emerald-600" />
              {title}
            </h4>
          );
        }

        const numMatch = line.match(/^(\d+)\.\s*\*\*(.*?)\*\*:(.*)/);
        if (numMatch) {
          const [, num, title, body] = numMatch;
          return (
            <div key={idx} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-emerald-300">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-black text-white shadow-sm ring-4 ring-emerald-50">
                {num}
              </span>
              <div className="grid min-w-0 flex-1 gap-1.5 sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-4">
                <div className="text-sm font-bold leading-6 text-slate-900">{title}</div>
                <div className="text-sm leading-6 text-slate-600">{parseBold(body.trim())}</div>
              </div>
            </div>
          );
        }

        return (
          <p key={idx} className="rounded-lg border border-slate-100 bg-slate-50/70 p-3 text-sm leading-6 text-slate-600">
            {parseBold(line)}
          </p>
        );
      })}
    </div>
  );
}

export function AiDecisionClient({ hideHeader = false }: { hideHeader?: boolean }) {
  const toast = useToast();
  const [run, setRun] = useState<AiRun | null>(null);
  const [master, setMaster] = useState<MasterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<AnalysisMode>("FAST");
  const [forceAiRegenerate, setForceAiRegenerate] = useState(false);
  const [jobActionPending, setJobActionPending] = useState<string | null>(null);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [preview, setPreview] = useState<AiPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [stopping, setStopping] = useState(false);

  const [filters, setFilters] = useState<Filters>({
    year: String(new Date().getFullYear()),
    unitId: "",
    categoryId: ""
  });
  const [visibleCount, setVisibleCount] = useState(10);
  const activeRunId = run?.id;
  const activeRunStatus = run?.status;
  const isRunActive = activeRunStatus === "RUNNING_RULE_ENGINE" || activeRunStatus === "PROCESSING_QUEUE" || activeRunStatus === "RUNNING";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setVisibleCount(10);

    try {
      const query = new URLSearchParams(filters);
      const [aiRes, masterRes] = await Promise.all([fetch(`/api/ai?${query}`), fetch("/api/master-data")]);
      const aiJson = await aiRes.json();
      const masterJson = await masterRes.json();

      if (!aiRes.ok) throw new Error(aiJson.error || "Hasil analisis AI belum dapat dimuat.");
      if (!masterRes.ok) throw new Error(masterJson.error || "Master data belum dapat dimuat.");

      setRun(aiJson.data || null);
      setMaster(masterJson);
    } catch (err) {
      setRun(null);
      setError(err instanceof Error ? err.message : "Hasil analisis AI belum dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setPreviewLoading(true);
      const query = new URLSearchParams({ ...filters, mode: selectedMode });
      try {
        const response = await fetch(`/api/ai/preview?${query}`, { signal: controller.signal, cache: "no-store" });
        const json = await response.json();
        if (response.ok) setPreview(json.data || null);
      } catch (error) {
        if (!(error instanceof Error && error.name === "AbortError")) setPreview(null);
      } finally {
        if (!controller.signal.aborted) setPreviewLoading(false);
      }
    }, 350);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [filters, selectedMode]);

  // Poll progress if run is in active state
  useEffect(() => {
    if (!activeRunId || (activeRunStatus !== "RUNNING_RULE_ENGINE" && activeRunStatus !== "PROCESSING_QUEUE" && activeRunStatus !== "RUNNING")) {
      return;
    }

    const interval = setInterval(async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch(`/api/ai/runs/${activeRunId}/progress`, { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (json.data) {
          setRun((current) => current ? { ...current, ...json.data, jobs: json.data.jobs || current.jobs } : current);
          if (["COMPLETED", "COMPLETED_WITH_ERRORS", "FAILED", "STOPPED"].includes(json.data.status)) {
            setRunning(false);
            void load();
          }
        }
      } catch {
        // ignore polling error
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [activeRunId, activeRunStatus, load]);

  useEffect(() => {
    if (!isRunActive) return;
    setClockNow(Date.now());
    const interval = setInterval(() => setClockNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isRunActive]);

  async function runAnalysis() {
    setRunning(true);
    setError(null);
    setVisibleCount(10);
    requestAnimationFrame(() => {
      document.getElementById("ai-starting")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...filters,
          mode: selectedMode,
          forceAiRegenerate
        })
      });

      const json = await response.json();

      if (!response.ok) {
        const message = json.error || "Analisis AI gagal.";
        setError(message);
        toast.push(message, "error");
        setRunning(false);
        return;
      }

      setRun(json.data);
      requestAnimationFrame(() => {
        document.getElementById("ai-progress")?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      toast.push(
        selectedMode === "FAST"
          ? "Analisis Rule Engine instan selesai!"
          : "Analisis Rule Engine selesai instan! Pengayaan AI diproses di latar belakang.",
        "success"
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal menjalankan analisis.";
      setError(message);
      toast.push(message, "error");
    } finally {
      setRunning(false);
    }
  }

  async function stopAnalysis() {
    setStopping(true);
    try {
      const response = await fetch("/api/ai", { method: "DELETE" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Analisis belum dapat dihentikan.");
      toast.push("Antrean AI dihentikan. Respons aset yang sedang diproses akan diabaikan.", "info");
      await load();
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Analisis belum dapat dihentikan.", "error");
    } finally {
      setStopping(false);
    }
  }

  async function triggerManualJob(assetId: string) {
    if (!run?.id) return;
    setJobActionPending(assetId);
    try {
      const res = await fetch("/api/ai/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId, runId: run.id })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal membuat pekerjaan AI.");
      toast.push("Pekerjaan AI berhasil didaftarkan ke antrean.", "success");
      void load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Gagal mendaftarkan pekerjaan AI.", "error");
    } finally {
      setJobActionPending(null);
    }
  }

  async function retryJob(jobId: string) {
    setJobActionPending(jobId);
    try {
      const res = await fetch("/api/ai/jobs/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal melakukan retry.");
      toast.push("Pekerjaan AI berhasil di-retry.", "success");
      void load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Gagal melakukan retry.", "error");
    } finally {
      setJobActionPending(null);
    }
  }

  const recommendations = useMemo(() => run?.recommendations || [], [run]);
  const metrics = useMemo(
    () =>
      metricConfig.map((item) => ({
        ...item,
        value: "type" in item
          ? recommendations.filter((recommendation) => recommendation.recommendationTypes?.includes(item.type)).length
          : recommendations.filter((recommendation) => recommendation.scoreStatus === item.status).length
      })),
    [recommendations]
  );
  const statusData = useMemo(() => countBy(recommendations, (item) => item.scoreStatus), [recommendations]);
  const recommendationData = useMemo(
    () =>
      countBy(
        recommendations.flatMap((item) => item.recommendationTypes || []),
        (item) => item
      ),
    [recommendations]
  );
  const criticalCount = recommendations.filter((item) => item.scoreStatus === "PRIORITAS_PENGGANTIAN").length;
  const averageScore = recommendations.length
    ? Math.round(recommendations.reduce((sum, item) => sum + item.score, 0) / recommendations.length)
    : 0;

  const ruleProgress = run?.totalAssets
    ? Math.round(((run.processedAssets || 0) / run.totalAssets) * 100)
    : 0;

  const aiProgress = run?.aiQueuedCount
    ? Math.round((((run.aiCompletedCount || 0) + (run.aiFailedCount || 0)) / run.aiQueuedCount) * 100)
    : 0;
  const jobs = run?.jobs || [];
  const pendingJobs = jobs.filter((job) => job.status === "PENDING").length;
  const processingJobs = jobs.filter((job) => job.status === "PROCESSING");
  const completedJobs = jobs.filter((job) => job.status === "COMPLETED");
  const currentJob = processingJobs[0];
  const currentAsset = currentJob
    ? recommendations.find((recommendation) => recommendation.asset.id === currentJob.assetId)?.asset
    : null;
  const currentElapsedMs = currentJob?.startedAt
    ? Math.max(0, clockNow - new Date(currentJob.startedAt).getTime())
    : 0;
  const measuredDurations = completedJobs
    .map((job) => job.inferenceDurationMs || 0)
    .filter((duration) => duration > 0);
  const averageInferenceMs = measuredDurations.length
    ? measuredDurations.reduce((total, duration) => total + duration, 0) / measuredDurations.length
    : 0;
  const remainingJobs = Math.max(0, (run?.aiQueuedCount || 0) - completedJobs.length - (run?.aiFailedCount || 0));
  const estimatedRemainingMs = averageInferenceMs ? remainingJobs * averageInferenceMs : 0;

  return (
    <PageStack>
      {!hideHeader && (
        <PageHeader
          eyebrow="Monitoring & AI Support"
          title="AI Decision Support (2-Stage Scoring & Enrichment)"
          description="Evaluasi instan berbasis Rule Engine untuk 1.000+ aset, diperkaya secara asinkron dengan narasi AI Ollama lokal."
        />
      )}

      <Card>
        <CardHeader className="flex flex-col gap-2">
          <CardTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-emerald-700" />
            Parameter & Mode Analisis
          </CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            Pilih mode eksekusi. Rule Engine akan menilai seluruh aset dalam detik pertama. Pengayaan narasi Ollama lokal dijalankan secara asinkron di latar belakang.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4">
          {/* Mode Selector */}
          <div className="grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => setSelectedMode("FAST")}
              className={`flex flex-col rounded-xl border p-3.5 text-left transition ${
                selectedMode === "FAST"
                  ? "border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-500/20"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-emerald-800 flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-emerald-600" />
                  Mode Cepat (FAST)
                </span>
                {selectedMode === "FAST" && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
              </div>
              <p className="mt-1 text-xs text-slate-600 leading-5">
                Rule Engine 100% instan untuk semua aset. Bebas beban LLM, disarankan untuk pemindaian berkala 1.000 aset.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setSelectedMode("RECOMMENDED")}
              className={`flex flex-col rounded-xl border p-3.5 text-left transition ${
                selectedMode === "RECOMMENDED"
                  ? "border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-500/20"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-emerald-800 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                  Mode Rekomendasi
                </span>
                {selectedMode === "RECOMMENDED" && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
              </div>
              <p className="mt-1 text-xs text-slate-600 leading-5">
                Rule Engine instan + Narasi AI otomatis untuk aset risiko tinggi (Skor ≥ 80) & Ringkasan Agregat Eksekutif.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setSelectedMode("FULL")}
              className={`flex flex-col rounded-xl border p-3.5 text-left transition ${
                selectedMode === "FULL"
                  ? "border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-500/20"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-emerald-800 flex items-center gap-1.5">
                  <Bot className="h-3.5 w-3.5 text-emerald-600" />
                  Mode Lengkap (FULL)
                </span>
                {selectedMode === "FULL" && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
              </div>
              <p className="mt-1 text-xs text-slate-600 leading-5">
                Rule Engine + Narasi AI untuk semua aset terpilih (Skor ≥ 30, Maks 50 aset per eksekusi).
              </p>
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[180px_minmax(220px,1fr)_minmax(220px,1fr)]">
            <Field label="Tahun Target">
              <Select value={filters.year} onChange={(event) => setFilters((prev) => ({ ...prev, year: event.target.value }))}>
                {Array.from({ length: 4 }, (_, i) => new Date().getFullYear() + i).map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Unit Kerja">
              <Select value={filters.unitId} onChange={(event) => setFilters((prev) => ({ ...prev, unitId: event.target.value }))}>
                <option value="">Semua unit kerja</option>
                {master?.units?.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Kategori Aset">
              <Select value={filters.categoryId} onChange={(event) => setFilters((prev) => ({ ...prev, categoryId: event.target.value }))}>
                <option value="">Semua kategori aset</option>
                {master?.categories?.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            {previewLoading ? (
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Menghitung estimasi analisis...
              </div>
            ) : preview ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Aset dinilai</div>
                  <div className="mt-1 text-lg font-black text-slate-900">{preview.assetsToEvaluate}</div>
                  {preview.capped ? <div className="text-[11px] text-amber-700">Dibatasi dari {preview.matchingAssets} aset</div> : null}
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Masuk Ollama</div>
                  <div className="mt-1 text-lg font-black text-emerald-700">{preview.eligibleAiAssets}</div>
                  <div className="text-[11px] text-slate-500">{preview.threshold ? `Skor minimal ${preview.threshold}` : "Mode tanpa narasi AI"}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Perkiraan waktu AI</div>
                  <div className="mt-1 text-lg font-black text-slate-900">{preview.estimatedDurationMs ? `± ${formatDuration(preview.estimatedDurationMs)}` : preview.eligibleAiAssets ? "Belum terukur" : "0s"}</div>
                  <div className="text-[11px] text-slate-500">{preview.queueAhead} pekerjaan lebih dulu di antrean</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Kelengkapan data</div>
                  <div className={`mt-1 text-lg font-black ${preview.dataQualityWarningAssets ? "text-amber-700" : "text-emerald-700"}`}>{preview.dataQualityWarningAssets}</div>
                  <div className="text-[11px] text-slate-500">aset memiliki tanggal penting yang kosong</div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-500">Estimasi belum tersedia.</div>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={forceAiRegenerate}
                onChange={(e) => setForceAiRegenerate(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              Paksa regenerasi cache AI (Bypass AI Cache)
            </label>

            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => void load()}>
                <Search className="h-4 w-4" />
                Filter
              </Button>
              <Button type="button" className="w-full whitespace-nowrap sm:w-auto font-bold bg-emerald-700 hover:bg-emerald-800 text-white" onClick={runAnalysis} disabled={running || isRunActive}>
                {running || isRunActive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {isRunActive ? "AI Sedang Berjalan..." : `Jalankan Analisis (${selectedMode})`}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {error ? <ErrorCard message={error} /> : null}

      {/* Immediate feedback while the synchronous rule-engine request is running. */}
      {running && !isRunActive ? (
        <Card id="ai-starting" className="sticky top-3 z-30 overflow-hidden border-2 border-cyan-400 bg-white shadow-xl shadow-cyan-900/10">
          <div className="h-1 w-full overflow-hidden bg-cyan-100">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-cyan-600" />
          </div>
          <CardContent className="flex items-start gap-3 p-4">
            <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-cyan-700" />
            <div>
              <div className="font-bold text-slate-900">Memulai analisis {selectedMode}...</div>
              <div className="mt-1 text-sm text-slate-600">
                Rule Engine sedang membaca dan memberi skor pada aset. Setelah tahap ini selesai, sistem akan menentukan aset yang memenuhi syarat untuk diproses Ollama.
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Progress Card */}
      {run && (isRunActive || run.status === "RULE_ENGINE_COMPLETED") ? (
        <Card id="ai-progress" className="sticky top-3 z-30 overflow-hidden border-2 border-emerald-400 bg-white shadow-xl shadow-emerald-900/10">
          <div className="h-1 w-full overflow-hidden bg-emerald-100">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-emerald-600" />
          </div>
          <CardContent className="grid gap-4 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 font-bold text-emerald-900">
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-600" />
                </span>
                {run.status === "RUNNING_RULE_ENGINE"
                  ? "Rule Engine sedang mengevaluasi aset..."
                  : processingJobs.length
                    ? "Ollama sedang menyusun analisis aset"
                    : "Rule Engine selesai! Menunggu worker AI mengambil antrean..."}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold text-emerald-700">LIVE · diperbarui setiap 2,5 detik</span>
                <Badge tone="info">Mode: {run.analysisMode || run.mode || "FAST"}</Badge>
                <Button type="button" variant="outline" className="h-8 border-red-200 text-xs font-bold text-red-700 hover:bg-red-50" onClick={stopAnalysis} disabled={stopping}>
                  {stopping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <StopCircle className="h-3.5 w-3.5" />}
                  Hentikan
                </Button>
              </div>
            </div>

            {currentJob ? (
              <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-emerald-700">
                    <Bot className="h-4 w-4 animate-pulse" /> Sedang dianalisis sekarang
                  </div>
                  <div className="mt-1 truncate text-sm font-bold text-slate-900">
                    {currentAsset ? `${currentAsset.assetCode} — ${currentAsset.assetName}` : `Aset ${currentJob.assetId}`}
                  </div>
                </div>
                <div className="shrink-0 rounded-lg bg-white px-3 py-2 text-right ring-1 ring-emerald-200">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Durasi berjalan</div>
                  <div className="font-mono text-sm font-black text-emerald-700">{formatDuration(currentElapsedMs)}</div>
                </div>
              </div>
            ) : null}

            {/* Rule Engine Progress */}
            <div className="grid gap-1">
              <div className="flex justify-between text-xs font-semibold text-slate-700">
                <span>Rule Engine Progress: {run.processedAssets || 0} / {run.totalAssets || 0} Aset</span>
                <span>{ruleProgress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full bg-emerald-600 transition-all duration-300" style={{ width: `${ruleProgress}%` }} />
              </div>
            </div>

            {/* AI Queue Progress */}
            {run.aiQueuedCount ? (
              <div className="grid gap-1 border-t border-emerald-200/60 pt-2">
                <div className="flex justify-between text-xs font-semibold text-slate-700">
                  <span>Progres Narasi AI: {(run.aiCompletedCount || 0) + (run.aiFailedCount || 0)} / {run.aiQueuedCount} selesai</span>
                  <span>{aiProgress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full bg-emerald-600 transition-all duration-500 ${processingJobs.length && aiProgress === 0 ? "animate-pulse" : ""}`}
                    style={{ width: `${processingJobs.length && aiProgress === 0 ? 4 : aiProgress}%` }}
                  />
                </div>
                <div className="grid gap-1 text-[11px] text-slate-500 sm:grid-cols-2">
                  <span>Diproses: {processingJobs.length} · Menunggu: {pendingJobs} · Selesai: {run.aiCompletedCount || 0} · Gagal: {run.aiFailedCount || 0}</span>
                  <span className="sm:text-right">
                    {estimatedRemainingMs ? `Estimasi tersisa ± ${formatDuration(estimatedRemainingMs)}` : "Estimasi tersedia setelah aset pertama selesai"}
                  </span>
                  <span className="sm:col-span-2 sm:text-right">Provider: {run.provider || "Ollama"} ({run.model})</span>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {run && !isRunActive && run.status?.startsWith("COMPLETED") && (run.analysisMode || run.mode) !== "FAST" && !run.aiQueuedCount ? (
        <Card className="border-amber-300 bg-amber-50/80 shadow-sm">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-amber-700" />
            <div className="min-w-0 flex-1">
              <div className="font-bold text-amber-950">Analisis selesai — tidak ada antrean Ollama</div>
              <p className="mt-1 text-sm leading-6 text-amber-900/80">
                Rule Engine telah menilai {run.processedAssets || run.totalAssets || 0} aset. Mode {run.analysisMode || run.mode} hanya membuat narasi AI untuk aset dengan skor minimal {(run.analysisMode || run.mode) === "FULL" ? 30 : 80}, dan pada run ini tidak ada aset yang memenuhi batas tersebut. Karena itu progres AI tidak berjalan.
              </p>
              <p className="mt-1 text-xs font-semibold text-amber-800">
                Untuk melihat proses narasi AI pada aset berisiko sedang, pilih Mode FULL (aset dengan skor minimal 30) atau gunakan tombol Analisis AI Manual pada aset tertentu.
              </p>
            </div>
            <Badge tone="warning">0 pekerjaan AI</Badge>
          </CardContent>
        </Card>
      ) : null}

      {loading ? (
        <Card>
          <CardContent className="p-4 text-sm font-semibold text-slate-600">Memuat data hasil analisis...</CardContent>
        </Card>
      ) : null}

      {/* Metrics Row */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Sparkles}
          label="Run Terakhir"
          value={run?.runCode || "-"}
          hint={run ? `${formatDateTime(run.createdAt)} | Mode: ${run.analysisMode || run.mode || "FAST"}` : "Belum ada hasil"}
          compact
          layout="horizontal"
        />
        <MetricCard icon={Gauge} label="Rata-rata Skor" value={averageScore} hint="Nilai risiko gabungan rule engine" layout="horizontal" />
        <MetricCard icon={ShieldAlert} label="Prioritas Kritis" value={criticalCount} hint="Skor ≥ 80 (Rencana Penggantian)" tone={criticalCount > 0 ? "danger" : "success"} layout="horizontal" />
        <MetricCard icon={Wrench} label="Total Rekomendasi" value={recommendations.length} hint={`${run?.totalAssets || 0} aset dianalisis`} layout="horizontal" />
      </section>

      {/* Sub-Metrics */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map(({ label, value, icon: Icon, tone }) => (
          <MetricCard key={label} icon={Icon} label={label} value={value} tone={tone} layout="horizontal" />
        ))}
      </section>

      {/* Executive Summary Panel */}
      {run?.executiveSummary ? (
        <Card className="overflow-hidden rounded-2xl border border-emerald-200 bg-slate-50/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-emerald-800/20 bg-emerald-800 px-5 py-3.5 text-white">
            <CardTitle className="flex min-w-0 items-center gap-3 text-sm font-bold uppercase tracking-wide text-white sm:text-base">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
                <Bot className="h-4.5 w-4.5 text-emerald-100" />
              </div>
              <span className="truncate">Executive Summary AI <span className="hidden font-medium text-emerald-100 sm:inline">— Agregat Rumah Sakit</span></span>
            </CardTitle>
            <span className="ml-3 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-emerald-100">
              <Sparkles className="h-3.5 w-3.5 text-emerald-300" />
              <span className="hidden sm:inline">AI Decision Support</span>
              <span className="sm:hidden">AI</span>
            </span>
          </CardHeader>
          <CardContent className="p-4 sm:p-5">
            <FormattedExecutiveSummary text={run.executiveSummary} />
          </CardContent>
        </Card>
      ) : null}

      {/* Charts Row */}
      <section className="grid gap-4 2xl:grid-cols-[0.9fr_1.1fr]">
        <RiskChart data={statusData} />
        <RecommendationChart data={recommendationData} />
      </section>

      {/* Main Results Table & Scoring Model */}
      <section className="grid gap-4 2xl:grid-cols-[0.75fr_1.25fr]">
        <ScoringModelCard />
        <Card>
          <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                Ringkasan Keputusan Aset
                {(run?.analysisMode || run?.mode) ? <Badge tone="info">Mode {run.analysisMode || run.mode}</Badge> : null}
              </CardTitle>
              <p className="mt-1 max-w-5xl text-sm leading-5 text-muted-foreground">
                {run ? `${run.runCode} - ${formatDateTime(run.createdAt)} - ${run.summary}` : "Belum ada analisis untuk filter ini."}
              </p>
            </div>
            <a
              className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-md border bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              href="/api/reports?type=ai&format=csv"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </a>
          </CardHeader>
          <CardContent className="grid gap-3">
            {recommendations.length ? (
              <>
                <div className="grid gap-3">
                  {recommendations.slice(0, visibleCount).map((recommendation) => (
                    <RecommendationItem
                      key={recommendation.id}
                      recommendation={recommendation}
                      onTriggerManualJob={triggerManualJob}
                      onRetryJob={retryJob}
                      isPending={jobActionPending === recommendation.asset.id || jobActionPending === recommendation.id}
                      jobs={run?.jobs}
                      runMode={run?.analysisMode || run?.mode || "FAST"}
                    />
                  ))}
                </div>
                {visibleCount < recommendations.length ? (
                  <div className="mt-4 flex justify-center">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full sm:w-auto font-bold border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                      onClick={() => setVisibleCount((prev) => prev + 10)}
                    >
                      Tampilkan Lebih Banyak ({recommendations.length - visibleCount} item tersisa)
                    </Button>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="rounded-md border bg-slate-50 p-4 text-sm font-semibold text-muted-foreground">
                Belum ada hasil. Jalankan analisis AI untuk membuat rekomendasi.
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </PageStack>
  );
}

// ponytail: exact dashboard styling for consistency
const dashboardCardStyle = "flex flex-col shadow-sm border-0 p-0 overflow-hidden bg-white ring-1 ring-slate-200/50";
const dashboardHeaderStyle = "bg-slate-50/50 px-4 py-3 border-b border-slate-100 flex items-center gap-2";
const dashboardHeaderTitleStyle = "text-xs font-extrabold uppercase tracking-widest text-slate-700";

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0];
    const nameLabel = label || data.name || data.payload?.label || data.payload?.name;
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-lg select-none">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: data.color || data.payload?.fill || data.fill || "#059669" }} />
          <span className="text-xs font-black text-slate-500 uppercase tracking-wider truncate max-w-[150px]">{nameLabel}</span>
        </div>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-sm font-black text-slate-900 leading-none">{data.value}</span>
          <span className="text-[11px] font-bold text-slate-400 leading-none">Aset</span>
        </div>
      </div>
    );
  }
  return null;
};

function RiskChart({ data }: { data: Array<{ name: string; total: number }> }) {
  const chartData = data.map((item) => ({ ...item, label: humanizeEnum(item.name) }));

  return (
    <Card className={dashboardCardStyle}>
      <div className={dashboardHeaderStyle}>
        <Activity className="h-4 w-4 text-emerald-600" />
        <span className={dashboardHeaderTitleStyle}>Status Risiko Aset</span>
      </div>
      <CardContent className="p-4 grid gap-4 lg:grid-cols-[240px_1fr]">
        <div className="h-[240px]">
          {chartData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="total"
                  nameKey="label"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={3}
                  stroke="#fff"
                  strokeWidth={2}
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={statusColors[entry.name] || "#64748b"} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          )}
        </div>
        <div className="grid content-center gap-3">
          {chartData.length ? (
            chartData.map((item) => (
              <div key={item.name} className="flex items-center justify-between rounded-md border bg-slate-50 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusColors[item.name] || "#64748b" }} />
                  <span className="text-sm font-bold text-slate-700">{item.label}</span>
                </div>
                <span className="text-sm font-semibold text-slate-950">{item.total}</span>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Belum ada distribusi risiko.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function RecommendationChart({ data }: { data: Array<{ name: string; total: number }> }) {
  const chartData = data.map((item) => ({ ...item, label: humanizeEnum(item.name).replace("Upgrade ", "") }));

  return (
    <Card className={dashboardCardStyle}>
      <div className={dashboardHeaderStyle}>
        <Lightbulb className="h-4 w-4 text-amber-500" />
        <span className={dashboardHeaderTitleStyle}>Komposisi Rekomendasi</span>
      </div>
      <CardContent className="flex-1 flex flex-col justify-center min-h-[220px] p-4">
        <div className="h-[300px] w-full">
          {chartData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ left: -25, right: 10, top: 20, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9, fontWeight: 700, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total" name="Total" fill="#059669" radius={[4, 4, 0, 0]} barSize={25}>
                  <LabelList dataKey="total" position="top" style={{ fontSize: 10, fontWeight: 800, fill: "#475569" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ScoringModelCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Model Penilaian Rule Engine</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {scoringFactors.map((factor) => (
          <div key={factor.label} className="rounded-md border bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold text-slate-950">{factor.label}</div>
              <Badge tone="info">{factor.value}</Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{factor.description}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RecommendationItem({
  recommendation,
  onTriggerManualJob,
  onRetryJob,
  isPending,
  jobs,
  runMode
}: {
  recommendation: Recommendation;
  onTriggerManualJob: (assetId: string) => void;
  onRetryJob: (jobId: string) => void;
  isPending: boolean;
  jobs?: AiJob[];
  runMode?: "FAST" | "RECOMMENDED" | "FULL";
}) {
  const repairCount = recommendation.asset._count?.serviceRecords || 0;
  const details = recommendation.details || [];

  const assetJob = jobs?.find((j) => j.assetId === recommendation.asset.id);

  // Determine the AI status note based on mode and state
  let aiNote: string | undefined;
  let aiNoteColor = "text-amber-700";

  if (recommendation.openModelSucceeded) {
    // AI succeeded — no note needed
    aiNote = undefined;
  } else if (assetJob?.status === "FAILED" && assetJob.error) {
    // AI job explicitly failed
    aiNote = `Pengayaan AI gagal: ${assetJob.error}`;
    aiNoteColor = "text-red-600";
  } else if (recommendation.openModelErrorMessage && recommendation.openModelErrorMessage !== "Menunggu antrean AI...") {
    // Has a real error message from the AI
    aiNote = `Pengayaan AI gagal: ${recommendation.openModelErrorMessage}`;
    aiNoteColor = "text-red-600";
  }
  // If no error — don't show any note (clean display for FAST mode and low-score assets)

  return (
    <article className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-panel transition hover:border-emerald-200">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-[11px] font-bold text-slate-700">
              {recommendation.asset.assetCode}
            </span>
            <Badge>{humanizeEnum(recommendation.scoreStatus)}</Badge>
            <span className="text-xs font-bold uppercase text-muted-foreground">Skor Risiko {recommendation.score}/100</span>
            {recommendation.openModelSucceeded ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700 border border-emerald-200">
                <Sparkles className="h-3 w-3" /> AI Enriched
              </span>
            ) : runMode === "FAST" ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700 border border-emerald-200">
                <Zap className="h-3 w-3" /> Rule Engine
              </span>
            ) : assetJob?.status === "PENDING" || assetJob?.status === "PROCESSING" ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold text-amber-700 border border-amber-200">
                <Loader2 className="h-3 w-3 animate-spin" /> AI Processing
              </span>
            ) : assetJob?.status === "FAILED" ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 text-[10px] font-extrabold text-red-600 border border-red-200">
                AI Gagal
              </span>
            ) : null}
          </div>
          <h3 className="mt-2 text-sm font-semibold text-slate-950">{recommendation.asset.assetName}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {recommendation.asset.unit?.name || "-"} / {recommendation.asset.category?.name || "-"} / {repairCount} riwayat perbaikan
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!recommendation.openModelSucceeded && runMode !== "FAST" ? (
            assetJob?.status === "FAILED" ? (
              <Button
                type="button"
                variant="outline"
                className="font-bold border-amber-300 text-amber-800 hover:bg-amber-50"
                onClick={() => onRetryJob(assetJob.id)}
                disabled={isPending}
              >
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                Retry AI
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="font-bold border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                onClick={() => onTriggerManualJob(recommendation.asset.id)}
                disabled={isPending || assetJob?.status === "PENDING" || assetJob?.status === "PROCESSING"}
              >
                {isPending || assetJob?.status === "PENDING" || assetJob?.status === "PROCESSING" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Bot className="h-3.5 w-3.5" />
                )}
                {assetJob?.status === "PENDING" ? "Dalam Antrean AI..." : assetJob?.status === "PROCESSING" ? "Memproses AI..." : "Analisis AI Manual"}
              </Button>
            )
          ) : null}

          <Link
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border bg-white px-3 text-sm font-bold text-emerald-700 transition hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
            href={`/assets/${recommendation.asset.id}`}
          >
            Detail Aset
            <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[0.85fr_1.15fr]">
        <InfoBlock
          label="Spesifikasi Hardware"
          value={[
            recommendation.asset.processor || "-",
            `${recommendation.asset.ram || "-"} / ${recommendation.asset.storage || "-"}`,
            recommendation.asset.operatingSystem || "-"
          ].join("\n")}
        />
        <InfoBlock label="Tindakan Disarankan (Rule Engine)" value={recommendation.recommendation} />
        <div className="lg:col-span-2">
          <InfoBlock
            label={recommendation.openModelSucceeded ? "Analisis Naratif AI (Ollama Lokal)" : "Alasan Penilaian (Rule Engine)"}
            value={recommendation.reason}
            note={aiNote}
            noteColor={aiNoteColor}
          />
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50/50 p-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-slate-400">Faktor Pemicu Skor Rule Engine</div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {details.length ? (
            details.map((detail) => (
              <span key={`${detail.factor}-${detail.scoreImpact}`} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700">
                {detail.factor}
                <span className="text-red-700">+{detail.scoreImpact}</span>
              </span>
            ))
          ) : (
            <span className="text-sm font-medium text-muted-foreground">Tidak ada faktor risiko signifikan.</span>
          )}
        </div>
      </div>
    </article>
  );
}

function InfoBlock({ label, value, note, noteColor }: { label: string; value?: string | null; note?: string; noteColor?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200/80 bg-slate-50/50 p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-slate-400">{label}</div>
      <div className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-800">{value || "-"}</div>
      {note ? <div className={`mt-2 text-xs font-bold ${noteColor || "text-amber-700"}`}>{note}</div> : null}
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card className="border-red-200 bg-red-50">
      <CardContent className="flex items-start gap-3 p-4 text-red-800">
        <AlertTriangle className="mt-0.5 h-5 w-5" />
        <div>
          <div className="font-semibold">Analisis belum dapat dimuat.</div>
          <div className="mt-1 text-sm">{message}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full min-h-[160px] items-center justify-center rounded-md border bg-slate-50 text-sm font-semibold text-muted-foreground">
      Belum ada data.
    </div>
  );
}

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, "0")}s` : `${seconds}s`;
}

function countBy<T>(items: T[], getKey: (item: T) => string) {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = getKey(item);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries()).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
}
