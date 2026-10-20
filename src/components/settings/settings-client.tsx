"use client";

import {
  Activity,
  AlertTriangle,
  Bot,
  Database,
  Download,
  KeyRound,
  RefreshCw,
  Save,
  ServerCog,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Undo2,
  Upload
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DatabaseStatusPanel } from "@/components/system/database-status";
import { UpdatePanel } from "@/components/settings/update-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader, PageStack } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { cn, formatDateTime, humanizeEnum } from "@/lib/utils";
import type { SystemSettings } from "@/lib/system-settings";

type EnvStatus = "ok" | "warning" | "missing";

type SettingsResponse = {
  settings: SystemSettings;
  runtime: {
    environment: string;
    serverTime: string;
    timezone: string;
    uptimeSeconds: number;
    readiness: {
      status: "ready" | "warning" | "blocked";
      blocking: number;
      warnings: number;
      total: number;
    };
    ai: {
      enabled: boolean;
      providerName: string;
      configured: boolean;
      model: string;
      baseUrl: string;
      maxTokens: number;
      timeoutMs: number;
    };
    auth: {
      sessionMaxAgeHours: number;
      publicRegistration: boolean;
      allowedAdminRoles: string[];
    };
    envChecks: Array<{
      key: string;
      label: string;
      category: string;
      required: boolean;
      secret: boolean;
      status: EnvStatus;
      value: string;
      description: string;
    }>;
  };
  capabilities: {
    canEdit: boolean;
  };
  recentAudit: Array<{
    id: string;
    action: string;
    description: string;
    createdAt: string;
    user: string;
  }>;
};

type SectionKey = "profile" | "operations" | "ai" | "security" | "backup" | "runtime" | "updates";

const sections: Array<{ key: SectionKey; label: string; icon: typeof Settings2 }> = [
  { key: "profile", label: "Profil Sistem", icon: Settings2 },
  { key: "operations", label: "Operasional", icon: SlidersHorizontal },
  { key: "ai", label: "AI & Decision Support", icon: Bot },
  { key: "security", label: "Keamanan & Akses", icon: ShieldCheck },
  { key: "backup", label: "Backup, Import & Database", icon: Database },
  { key: "runtime", label: "Runtime", icon: ServerCog },
  { key: "updates", label: "Pembaruan Sistem", icon: RefreshCw }
];

function cloneSettings(settings: SystemSettings) {
  return JSON.parse(JSON.stringify(settings)) as SystemSettings;
}

export function SettingsClient() {
  const toast = useToast();
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [draft, setDraft] = useState<SystemSettings | null>(null);
  const [saved, setSaved] = useState<SystemSettings | null>(null);
  const [active, setActive] = useState<SectionKey>("profile");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/settings", { cache: "no-store" });
      const json = (await response.json()) as SettingsResponse & { error?: string };
      if (!response.ok) throw new Error(json.error || "Pengaturan belum dapat dimuat.");
      setData(json);
      setDraft(cloneSettings(json.settings));
      setSaved(cloneSettings(json.settings));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pengaturan belum dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const dirty = useMemo(() => Boolean(draft && saved && JSON.stringify(draft) !== JSON.stringify(saved)), [draft, saved]);

  const saveSettings = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: draft })
      });
      const json = (await response.json()) as Partial<SettingsResponse> & { error?: string };
      if (!response.ok || !json.settings) throw new Error(json.error || "Gagal menyimpan pengaturan.");

      const nextData: SettingsResponse = {
        ...(data as SettingsResponse),
        settings: json.settings,
        runtime: json.runtime || (data as SettingsResponse).runtime
      };
      setData(nextData);
      setDraft(cloneSettings(json.settings));
      setSaved(cloneSettings(json.settings));
      toast.push("Pengaturan berhasil disimpan.", "success");
      void loadSettings();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal menyimpan pengaturan.";
      setError(message);
      toast.push(message, "error");
    } finally {
      setSaving(false);
    }
  };

  function updateSection<K extends keyof SystemSettings, F extends keyof SystemSettings[K]>(section: K, field: F, value: SystemSettings[K][F]) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        [section]: {
          ...current[section],
          [field]: value
        }
      };
    });
  }

  if (loading && !draft) {
    return (
      <PageStack>
        <PageHeader eyebrow="Administrasi" title="Pengaturan" description="Memuat konfigurasi sistem ASCIT." />
        <Card>
          <CardContent className="flex min-h-[120px] items-center justify-center text-sm font-medium text-muted-foreground">
            Memuat pengaturan sistem...
          </CardContent>
        </Card>
      </PageStack>
    );
  }

  if (!draft || !data) {
    return (
      <PageStack>
        <PageHeader eyebrow="Administrasi" title="Pengaturan" description="Konfigurasi sistem belum dapat dibaca." />
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 text-red-800">
              <AlertTriangle className="mt-0.5 h-5 w-5" />
              <div>
                <div className="font-bold">Pengaturan belum dapat dimuat.</div>
                <div className="mt-1 text-sm">{error || "Periksa sesi login dan koneksi database."}</div>
              </div>
            </div>
            <Button type="button" variant="outline" onClick={() => void loadSettings()}>
              <RefreshCw className="h-4 w-4" />
              Coba Lagi
            </Button>
          </CardContent>
        </Card>
      </PageStack>
    );
  }

  const canEdit = data.capabilities.canEdit;
  const readinessTone = data.runtime.readiness.status === "ready" ? "success" : data.runtime.readiness.status === "warning" ? "warning" : "danger";

  return (
    <PageStack>
      <PageHeader
        eyebrow="Administrasi"
        title="Pengaturan"
        description="Kelola profil aplikasi, kebijakan operasional, konfigurasi AI, keamanan, status database, dan readiness runtime tanpa menampilkan nilai rahasia."
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => void loadSettings()} disabled={loading || saving}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
            <Button type="button" variant="outline" onClick={() => draft && saved && setDraft(cloneSettings(saved))} disabled={!dirty || saving}>
              <Undo2 className="h-4 w-4" />
              Reset
            </Button>
            <Button type="button" onClick={saveSettings} disabled={!canEdit || !dirty || saving}>
              <Save className="h-4 w-4" />
              {saving ? "Menyimpan" : "Simpan"}
            </Button>
          </>
        }
      />

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : null}

      {!canEdit ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          Akun Anda dapat melihat pengaturan, tetapi tidak memiliki izin untuk menyimpan perubahan.
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <SummaryTile icon={ServerCog} label="Readiness runtime" value={humanizeEnum(data.runtime.readiness.status)} tone={readinessTone} hint={`${data.runtime.readiness.blocking} blocker, ${data.runtime.readiness.warnings} peringatan`} />
        <SummaryTile icon={Bot} label="AI Decision Support" value={data.runtime.ai.configured ? "Siap" : "Belum lengkap"} tone={data.runtime.ai.configured ? "success" : "warning"} hint={data.runtime.ai.model} />
        <SummaryTile icon={KeyRound} label="Akses edit" value={canEdit ? "Diizinkan" : "Read only"} tone={canEdit ? "success" : "muted"} hint={data.runtime.auth.allowedAdminRoles.join(", ")} />
        <SummaryTile icon={Activity} label="Server" value={data.runtime.environment} tone="info" hint={`Uptime ${formatUptime(data.runtime.uptimeSeconds)}`} />
      </section>

      <DatabaseStatusPanel />

      <section className="grid gap-4 xl:grid-cols-[230px_minmax(0,1fr)]">
        <nav className="grid content-start gap-2">
          {sections.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActive(key)}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-md border px-3 text-left text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200",
                active === key ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>

        <div className="min-w-0">
          {active === "profile" ? <ProfileSection draft={draft} updateSection={updateSection} disabled={!canEdit || saving} /> : null}
          {active === "operations" ? <OperationsSection draft={draft} updateSection={updateSection} disabled={!canEdit || saving} /> : null}
          {active === "ai" ? <AiSection draft={draft} data={data} updateSection={updateSection} disabled={!canEdit || saving} /> : null}
          {active === "security" ? (
            <SecuritySection draft={draft} updateSection={updateSection} disabled={!canEdit || saving} />
          ) : null}
          {active === "backup" ? <BackupSection draft={draft} /> : null}
          {active === "runtime" ? <RuntimeSection data={data} /> : null}
          {active === "updates" ? <UpdatePanel /> : null}
        </div>
      </section>
    </PageStack>
  );
}

function ProfileSection({
  draft,
  updateSection,
  disabled
}: {
  draft: SystemSettings;
  updateSection: <K extends keyof SystemSettings, F extends keyof SystemSettings[K]>(section: K, field: F, value: SystemSettings[K][F]) => void;
  disabled: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Profil Sistem</CardTitle>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">Identitas aplikasi dan batas scope data yang muncul di dokumentasi operasional.</p>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <Field label="Nama sistem">
          <Input value={draft.profile.systemName} onChange={(event) => updateSection("profile", "systemName", event.target.value)} disabled={disabled} />
        </Field>
        <Field label="Subtitle sistem">
          <Input value={draft.profile.systemSubtitle} onChange={(event) => updateSection("profile", "systemSubtitle", event.target.value)} disabled={disabled} />
        </Field>
        <Field label="Organisasi">
          <Input value={draft.profile.organizationName} onChange={(event) => updateSection("profile", "organizationName", event.target.value)} disabled={disabled} />
        </Field>
        <Field label="Site">
          <Input value={draft.profile.siteName} onChange={(event) => updateSection("profile", "siteName", event.target.value)} disabled={disabled} />
        </Field>
        <Field label="Divisi">
          <Input value={draft.profile.divisionName} onChange={(event) => updateSection("profile", "divisionName", event.target.value)} disabled={disabled} />
        </Field>
        <Field label="Timezone">
          <Select value={draft.profile.timezone} onChange={(event) => updateSection("profile", "timezone", event.target.value)} disabled={disabled}>
            <option value="Asia/Jakarta">Asia/Jakarta</option>
            <option value="Asia/Makassar">Asia/Makassar</option>
            <option value="Asia/Jayapura">Asia/Jayapura</option>
            <option value="UTC">UTC</option>
          </Select>
        </Field>
        <Field label="Email support">
          <Input type="email" value={draft.profile.supportEmail} onChange={(event) => updateSection("profile", "supportEmail", event.target.value)} disabled={disabled} />
        </Field>
        <Field label="Telepon support">
          <Input value={draft.profile.supportPhone} onChange={(event) => updateSection("profile", "supportPhone", event.target.value)} disabled={disabled} />
        </Field>
        <div className="lg:col-span-2">
          <Field label="Batas scope data">
            <Textarea value={draft.profile.dataScopeNote} onChange={(event) => updateSection("profile", "dataScopeNote", event.target.value)} disabled={disabled} />
          </Field>
        </div>
      </CardContent>
    </Card>
  );
}

function OperationsSection({
  draft,
  updateSection,
  disabled
}: {
  draft: SystemSettings;
  updateSection: <K extends keyof SystemSettings, F extends keyof SystemSettings[K]>(section: K, field: F, value: SystemSettings[K][F]) => void;
  disabled: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Kebijakan Operasional</CardTitle>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">Nilai acuan untuk monitoring aset, garansi, maintenance, QR, dan laporan.</p>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <NumberField label="Peringatan garansi (hari)" value={draft.operations.warrantyWarningDays} disabled={disabled} onChange={(value) => updateSection("operations", "warrantyWarningDays", value)} />
        <NumberField label="Reminder maintenance (hari)" value={draft.operations.maintenanceReminderDays} disabled={disabled} onChange={(value) => updateSection("operations", "maintenanceReminderDays", value)} />
        <NumberField label="Umur aset perlu pantau (tahun)" value={draft.operations.assetWatchYears} disabled={disabled} onChange={(value) => updateSection("operations", "assetWatchYears", value)} />
        <NumberField label="Umur aset kritis (tahun)" value={draft.operations.assetCriticalYears} disabled={disabled} onChange={(value) => updateSection("operations", "assetCriticalYears", value)} />
        <Field label="Base path QR">
          <Input value={draft.operations.qrBasePath} onChange={(event) => updateSection("operations", "qrBasePath", event.target.value)} disabled={disabled} />
        </Field>
        <Field label="Format laporan default">
          <Select value={draft.operations.defaultReportFormat} onChange={(event) => updateSection("operations", "defaultReportFormat", event.target.value as "CSV" | "PRINT")} disabled={disabled}>
            <option value="CSV">CSV</option>
            <option value="PRINT">Print</option>
          </Select>
        </Field>
        <SettingSwitch label="Approval mutasi wajib" description="Mutasi tetap melewati antrian approval sebelum dianggap selesai." checked={draft.operations.requireMutationApproval} disabled={disabled} onChange={(checked) => updateSection("operations", "requireMutationApproval", checked)} />
        <SettingSwitch label="Ringkasan eksekutif" description="Tampilkan ringkasan untuk dashboard dan laporan manajemen." checked={draft.operations.showExecutiveSummary} disabled={disabled} onChange={(checked) => updateSection("operations", "showExecutiveSummary", checked)} />
      </CardContent>
    </Card>
  );
}

function AiSection({
  draft,
  data,
  updateSection,
  disabled
}: {
  draft: SystemSettings;
  data: SettingsResponse;
  updateSection: <K extends keyof SystemSettings, F extends keyof SystemSettings[K]>(section: K, field: F, value: SystemSettings[K][F]) => void;
  disabled: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Decision Support</CardTitle>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">Atur analisis AI lokal melalui Ollama tanpa layanan API eksternal.</p>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 lg:col-span-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-bold text-slate-900">Status {draft.ai.providerName || "AI Lokal"}</div>
              <div className="mt-1 text-sm text-muted-foreground">{draft.ai.baseUrl || data.runtime.ai.baseUrl}</div>
            </div>
            <Badge tone={data.runtime.ai.configured ? "success" : "warning"}>{data.runtime.ai.configured ? "Ollama dikonfigurasi" : "Ollama belum siap"}</Badge>
          </div>
        </div>
        <SettingSwitch label="Aktifkan AI" description={`Rule engine tetap berjalan; ${draft.ai.providerName || "AI Lokal"} dipakai untuk narasi jika diaktifkan.`} checked={draft.ai.enabled} disabled={disabled} onChange={(checked) => updateSection("ai", "enabled", checked)} />
        <SettingSwitch label={`Narasi ${draft.ai.providerName || "AI Lokal"}`} description="Tambahkan penjelasan natural language pada rekomendasi aset." checked={draft.ai.allowNarrativeExplanation} disabled={disabled} onChange={(checked) => updateSection("ai", "allowNarrativeExplanation", checked)} />
        <Field label="Provider AI">
          <Input value="Ollama" disabled />
        </Field>
        <Field label="Base URL Ollama">
          <Input value={draft.ai.baseUrl} onChange={(event) => updateSection("ai", "baseUrl", event.target.value)} disabled={disabled} />
        </Field>
        <Field label="Model default">
          <Input value={draft.ai.defaultModel} onChange={(event) => updateSection("ai", "defaultModel", event.target.value)} disabled={disabled} />
        </Field>
        <NumberField label="Maksimal aset per run" value={draft.ai.maxAssetsPerRun} disabled={disabled} onChange={(value) => updateSection("ai", "maxAssetsPerRun", value)} />
        <NumberField label="Threshold pantau" value={draft.ai.watchThreshold} disabled={disabled} onChange={(value) => updateSection("ai", "watchThreshold", value)} />
        <NumberField label="Threshold upgrade" value={draft.ai.upgradeThreshold} disabled={disabled} onChange={(value) => updateSection("ai", "upgradeThreshold", value)} />
        <NumberField label="Threshold penggantian" value={draft.ai.replacementThreshold} disabled={disabled} onChange={(value) => updateSection("ai", "replacementThreshold", value)} />
        
        <div className="lg:col-span-2 border-t pt-4 mt-2">
          <h4 className="text-sm font-bold text-slate-900 mb-3">Konfigurasi Lanjut Model (Model Parameters)</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField label="API Timeout (detik)" value={draft.ai.apiTimeoutSeconds ?? 30} disabled={disabled} onChange={(value) => updateSection("ai", "apiTimeoutSeconds", value)} />
            <NumberField label="Maksimal Tokens Output" value={draft.ai.maxTokens ?? 2048} disabled={disabled} onChange={(value) => updateSection("ai", "maxTokens", value)} />
            <Field label="Temperature (kreativitas narasi AI)">
              <Input type="number" step="0.1" min="0" max="1" value={draft.ai.temperature ?? 0.3} onChange={(event) => updateSection("ai", "temperature", Number(event.target.value))} disabled={disabled} />
            </Field>
            <Field label="Gaya Bahasa Prompt AI">
              <Select value={draft.ai.systemPromptStyle ?? "FORMAL"} onChange={(event) => updateSection("ai", "systemPromptStyle", event.target.value as "FORMAL" | "DETAILED" | "CONCISE")} disabled={disabled}>
                <option value="FORMAL">Analitis & Formal (Default)</option>
                <option value="DETAILED">Teknis & Mendalam (Detail Logis)</option>
                <option value="CONCISE">Ringkas & Padat (To-the-point)</option>
              </Select>
            </Field>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SecuritySection({
  draft,
  updateSection,
  disabled
}: {
  draft: SystemSettings;
  updateSection: <K extends keyof SystemSettings, F extends keyof SystemSettings[K]>(section: K, field: F, value: SystemSettings[K][F]) => void;
  disabled: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Keamanan dan Akses</CardTitle>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">Batas keamanan sistem untuk akses admin, audit, password, dan data sensitif.</p>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <NumberField label="Durasi sesi acuan (jam)" value={draft.security.sessionMaxAgeHours} disabled={disabled} onChange={(value) => updateSection("security", "sessionMaxAgeHours", value)} />
        <NumberField label="Retensi audit log (hari)" value={draft.security.auditRetentionDays} disabled={disabled} onChange={(value) => updateSection("security", "auditRetentionDays", value)} />
        <SettingSwitch label="Proteksi data pasien" description="ASCIT tetap dibatasi untuk data aset IT dan tidak menyimpan data klinis." checked={draft.security.patientDataGuard} disabled={disabled} onChange={(checked) => updateSection("security", "patientDataGuard", checked)} />
        <SettingSwitch label="Password kuat wajib" description="Akun baru harus memakai kombinasi huruf dan angka minimal 8 karakter." checked={draft.security.requireStrongPassword} disabled={disabled} onChange={(checked) => updateSection("security", "requireStrongPassword", checked)} />
        <SettingSwitch label="Registrasi publik" description="Selalu disimpan nonaktif untuk mencegah akun liar." checked={draft.security.allowPublicRegistration} disabled onChange={() => undefined} />
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm font-bold text-slate-900">Hak kelola pengaturan</div>
          <p className="mt-2 text-sm leading-5 text-muted-foreground">Akses halaman ini mengikuti permission <span className="font-mono font-bold text-emerald-700">settings:manage</span>. Atur melalui menu Pengguna dan Hak Akses agar role bawaan maupun role baru diproses konsisten.</p>
        </div>
      </CardContent>
    </Card>
  );
}

function BackupSection({ draft }: { draft: SystemSettings }) {
  const toast = useToast();
  const [pruning, setPruning] = useState(false);
  const [pruneResult, setPruneResult] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [importBackup, setImportBackup] = useState<Record<string, unknown> | null>(null);
  const [importSummary, setImportSummary] = useState<{ total: number; counts: Record<string, number>; skippedUsers: number } | null>(null);
  const [importing, setImporting] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [importingSql, setImportingSql] = useState(false);
  const [downloading, setDownloading] = useState<"sql" | "json" | null>(null);
  const [backupStatus, setBackupStatus] = useState<{ sqlReady: boolean; restoreEnabled: boolean; restoreReady: boolean } | null>(null);
  const [backupStatusError, setBackupStatusError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/settings/backup?format=status", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 403 ? "Fitur backup hanya tersedia untuk administrator sistem." : "Status backup belum dapat dimuat.");
        const status = await response.json();
        if (active) setBackupStatus(status);
      })
      .catch((error) => { if (active) setBackupStatusError(error.message); });
    return () => { active = false; };
  }, []);

  const downloadBackup = async (format: "sql" | "json") => {
    setDownloading(format);
    try {
      const response = await fetch(`/api/settings/backup?format=${format}`, { cache: "no-store" });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Backup gagal dibuat.");
      }
      const blob = await response.blob();
      if (!blob.size) throw new Error("File backup kosong.");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = response.headers.get("Content-Disposition")?.match(/filename="?([^";]+)"?/)?.[1] || `ascit_backup.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.push("File backup berhasil dibuat dan unduhan dimulai.", "success");
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Backup gagal dibuat.", "error");
    } finally { setDownloading(null); }
  };

  const handleImportFile = async (file?: File) => {
    setImportBackup(null);
    setImportSummary(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".json")) return toast.push("Pilih file backup ASCIT berformat JSON.", "error");
    if (file.size > 15 * 1024 * 1024) return toast.push("File impor maksimal 15 MB.", "error");
    try {
      const backup = JSON.parse(await file.text()) as Record<string, unknown>;
      const response = await fetch("/api/settings/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ backup, preview: true }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "File tidak dapat dipreview.");
      setImportBackup(backup);
      setImportSummary(json.data);
      toast.push("File valid. Periksa ringkasan sebelum impor.", "success");
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "File JSON tidak valid.", "error");
    }
  };

  const confirmImport = async () => {
    if (!importBackup) return;
    setShowImportConfirm(false);
    setImporting(true);
    try {
      const response = await fetch("/api/settings/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ backup: importBackup }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Impor data gagal.");
      toast.push(json.message || "Impor data berhasil.", "success");
      setImportBackup(null);
      setImportSummary(null);
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Impor data gagal.", "error");
    } finally {
      setImporting(false);
    }
  };

  const handleSqlImport = async (file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".sql")) return toast.push("Pilih file backup SQL.", "error");
    if (!window.confirm("Restore SQL akan mengganti isi database aktif. Pastikan backup terbaru sudah disimpan. Lanjutkan?")) return;
    setImportingSql(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/settings/import-sql", { method: "POST", headers: { "x-ascit-confirm": "RESTORE-SQL-BACKUP" }, body: form });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Restore SQL gagal.");
      toast.push(json.message || "Restore SQL berhasil.", "success");
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Restore SQL gagal.", "error");
    } finally {
      setImportingSql(false);
    }
  };

  const handlePrune = async () => {
    setShowConfirm(false);
    setPruning(true);
    setPruneResult(null);
    try {
      const response = await fetch("/api/settings/backup", {
        method: "POST"
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Gagal melakukan pemeliharaan.");
      toast.push(json.message, "success");
      setPruneResult(json.message);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal memangkas log.";
      toast.push(msg, "error");
      setPruneResult(`Error: ${msg}`);
    } finally {
      setPruning(false);
    }
  };
  const handleClearDatabase = async () => { setClearing(true); const response = await fetch("/api/settings/clear", { method: "POST", headers: { "x-ascit-confirm": "CLEAR-OPERATIONAL-DATA" } }); const json = await response.json().catch(() => ({})); setClearing(false); setShowClearConfirm(false); if (!response.ok) return toast.push(json.error || "Database gagal dibersihkan.", "error"); toast.push("Data operasional berhasil dibersihkan. Pengguna dan master data tetap aman.", "success"); };

  return (
    <div className="grid gap-4 animate-page-in">
      <Card>
        <CardHeader>
          <CardTitle>Ekspor Backup Database</CardTitle>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">Unduh salinan data seluruh sistem ASCIT untuk cadangan keamanan atau migrasi.</p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col justify-between rounded-md border border-slate-200 bg-slate-50 p-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Database className="h-5 w-5 text-emerald-700" />
                Database Backup (.SQL)
              </div>
              <p className="mt-2 text-sm leading-5 text-muted-foreground">
                Cadangan lengkap struktur dan isi database, termasuk akun dan riwayat layanan. Simpan file ini di tempat yang aman.
              </p>
              <p className="mt-2 text-xs text-slate-600">{backupStatusError || (!backupStatus ? "Memeriksa kesiapan backup..." : backupStatus.sqlReady ? "Backup SQL siap digunakan." : "Alat backup PostgreSQL belum tersedia di server.")}</p>
            </div>
            <div className="mt-4">
              <Button type="button" disabled={!backupStatus?.sqlReady || !!downloading} onClick={() => void downloadBackup("sql")}>
                <Download className="h-4 w-4" />
                {downloading === "sql" ? "Membuat Backup..." : "Unduh SQL Backup"}
              </Button>
            </div>
          </div>
          <div className="flex flex-col justify-between rounded-md border border-amber-200 bg-amber-50 p-4">
            <div>
              <div className="text-sm font-bold text-amber-950">Restore Database Backup (.SQL)</div>
              <p className="mt-2 text-sm leading-5 text-amber-900">
                Mengganti database aktif dari file SQL. Gunakan hanya setelah menyimpan backup terbaru.
              </p>
              <p className="mt-2 text-xs text-amber-900">{!backupStatus ? "Memeriksa konfigurasi restore..." : !backupStatus.restoreEnabled ? "Restore melalui web dinonaktifkan pada server ini." : !backupStatus.restoreReady ? "Alat pemulihan PostgreSQL belum tersedia." : "Restore SQL tersedia untuk administrator."}</p>
            </div>
            <div className="mt-4">
              <label className={cn("inline-flex h-9 w-fit items-center justify-center gap-2 rounded-md border border-amber-300 bg-white px-4 text-sm font-bold text-amber-800", backupStatus?.restoreReady ? "cursor-pointer hover:bg-amber-100" : "cursor-not-allowed opacity-50")}>
                <Upload className="h-4 w-4" /> {importingSql ? "Memulihkan..." : "Pilih File SQL"}
                <input type="file" accept=".sql,application/sql" className="sr-only" disabled={importingSql || !backupStatus?.restoreReady} onChange={(event) => void handleSqlImport(event.target.files?.[0])} />
              </label>
            </div>
          </div>
          <div className="flex flex-col justify-between rounded-md border border-red-200 bg-red-50 p-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-red-900">
                <Trash2 className="h-5 w-5 text-red-700" />
                Clear Database Operasional
              </div>
              <p className="mt-2 text-sm leading-5 text-red-800">
                Hapus aset, mutasi, service record, dan audit log. Pengguna, role, serta master data tetap aman.
              </p>
            </div>
            <div className="mt-4">
              <Button type="button" variant="outline" className="border-red-300 bg-white text-red-700 hover:bg-red-100" onClick={() => setShowClearConfirm(true)} disabled={clearing}>
                <Trash2 className="h-4 w-4" />{clearing ? "Membersihkan..." : "Clear Database"}
              </Button>
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-md border border-slate-200 bg-slate-50 p-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Download className="h-5 w-5 text-emerald-700" />
                Portable Data Export (.JSON)
              </div>
              <p className="mt-2 text-sm leading-5 text-muted-foreground">
                Ekspor data aset, master data, layanan, dan pengaturan untuk impor portable. Tidak mencakup password akun; audit log dibatasi 500 entri terbaru. Gunakan SQL untuk backup lengkap.
              </p>
            </div>
            <div className="mt-4">
              <Button type="button" disabled={!backupStatus || !!downloading} onClick={() => void downloadBackup("json")}>
                <Download className="h-4 w-4" />
                {downloading === "json" ? "Membuat Ekspor..." : "Unduh JSON Portable"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Impor Data Portable</CardTitle>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">Gabungkan backup JSON ASCIT ke database aktif secara transaksional. Jika satu data gagal, seluruh proses otomatis dibatalkan.</p>
        </CardHeader>
        <CardContent className="grid gap-4">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center transition hover:border-emerald-300 hover:bg-emerald-50/40">
            <Upload className="h-8 w-8 text-emerald-700" />
            <span className="mt-3 text-sm font-bold text-slate-900">Pilih Backup JSON ASCIT</span>
            <span className="mt-1 text-xs text-muted-foreground">Maksimal 15 MB. Data user dan password tidak diimpor.</span>
            <input type="file" accept="application/json,.json" className="sr-only" disabled={importing} onChange={(event) => void handleImportFile(event.target.files?.[0])} />
          </label>
          {importSummary ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div><div className="text-sm font-bold text-emerald-950">{importSummary.total} data siap diproses</div><p className="mt-1 text-xs text-emerald-800">{Object.entries(importSummary.counts).filter(([, count]) => count > 0).map(([key, count]) => `${key}: ${count}`).join(" • ")}</p>{importSummary.skippedUsers ? <p className="mt-1 text-xs font-semibold text-amber-700">{importSummary.skippedUsers} user dilewati untuk melindungi kredensial.</p> : null}</div>
                <Button type="button" onClick={() => setShowImportConfirm(true)} disabled={importing}>{importing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{importing ? "Mengimpor..." : "Impor Sekarang"}</Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pemeliharaan Database (Database Maintenance)</CardTitle>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">Optimalkan ukuran penyimpanan database PostgreSQL Anda dengan membersihkan data log audit lama.</p>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-bold text-slate-900">Pemangkasan Log Audit Otomatis</div>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">
                  Hapus data riwayat aksi yang berumur lebih dari <span className="font-bold text-slate-800">{draft.security.auditRetentionDays} hari</span> (sesuai kebijakan retensi keamanan yang dikonfigurasi).
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="border-red-200 text-red-700 hover:bg-red-50"
                onClick={() => setShowConfirm(true)}
                disabled={pruning}
              >
                <Trash2 className="h-4 w-4" />
                {pruning ? "Memangkas..." : "Pangkas Log Audit"}
              </Button>
            </div>
            {pruneResult && (
              <div className="mt-3 rounded-md bg-white border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
                {pruneResult}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {showConfirm && (
        <ConfirmDialog
          title="Pangkas Log Audit"
          message={`Apakah Anda yakin ingin memangkas log audit yang berumur lebih dari ${draft.security.auditRetentionDays} hari? Tindakan ini tidak dapat dibatalkan.`}
          confirmLabel="Ya, Pangkas"
          variant="danger"
          onConfirm={handlePrune}
          onCancel={() => setShowConfirm(false)}
        />
      )}
      {showClearConfirm ? <ConfirmDialog title="Clear Database Operasional" message="Data aset, mutasi, service record, dan audit log akan dihapus permanen. Pengguna, role, dan master data tetap dipertahankan. Lanjutkan?" confirmLabel="Ya, Clear Database" variant="danger" onConfirm={handleClearDatabase} onCancel={() => setShowClearConfirm(false)} /> : null}
      {showImportConfirm && importSummary ? (
        <ConfirmDialog title="Konfirmasi Impor Data" message={`Proses ${importSummary.total} data dari backup ini? Data dengan ID yang sama akan diperbarui. Seluruh transaksi dibatalkan bila terjadi satu kegagalan.`} confirmLabel="Ya, Impor Data" variant="warning" onConfirm={confirmImport} onCancel={() => setShowImportConfirm(false)} />
      ) : null}
    </div>
  );
}

function RuntimeSection({ data }: { data: SettingsResponse }) {
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Runtime dan Environment</CardTitle>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">Pemeriksaan readiness tanpa membocorkan nilai rahasia dari server.</p>
        </CardHeader>
        <CardContent className="grid gap-3">
          {data.runtime.envChecks.map((item) => (
            <div key={item.key} className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-mono text-xs font-bold text-emerald-800">{item.key}</div>
                  <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
                  {item.required ? <Badge tone="info">Wajib</Badge> : <Badge tone="muted">Opsional</Badge>}
                </div>
                <div className="mt-2 text-sm font-bold text-slate-900">{item.label}</div>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">{item.description}</p>
              </div>
              <div className="min-w-0 rounded-md border bg-white px-3 py-2 font-mono text-xs font-semibold text-slate-600 lg:min-w-[220px]">
                {item.value}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <Card>
          <CardHeader>
            <CardTitle>Info Server</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <InfoRow label="Environment" value={data.runtime.environment} />
            <InfoRow label="Server time" value={formatDateTime(data.runtime.serverTime)} />
            <InfoRow label="Timezone aplikasi" value={data.runtime.timezone} />
            <InfoRow label="Uptime" value={formatUptime(data.runtime.uptimeSeconds)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Riwayat Perubahan Settings</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {data.recentAudit.length ? (
              data.recentAudit.map((row) => (
                <div key={row.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-bold text-slate-900">{row.user}</div>
                    <div className="text-xs font-medium text-muted-foreground">{formatDateTime(row.createdAt)}</div>
                  </div>
                  <div className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-emerald-700">{row.action}</div>
                  <p className="mt-1 text-sm leading-5 text-slate-700">{row.description}</p>
                </div>
              ))
            ) : (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-6 text-center text-sm font-medium text-muted-foreground">
                Belum ada perubahan settings yang tercatat.
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  hint,
  tone
}: {
  icon: typeof Settings2;
  label: string;
  value: string;
  hint: string;
  tone: "success" | "warning" | "danger" | "info" | "muted";
}) {
  return (
    <Card>
      <CardContent className="flex min-h-[104px] items-start gap-3 p-4">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
            tone === "success" && "bg-emerald-50 text-emerald-700",
            tone === "warning" && "bg-amber-50 text-amber-700",
            tone === "danger" && "bg-red-50 text-red-700",
            tone === "info" && "bg-emerald-50 text-emerald-700",
            tone === "muted" && "bg-slate-100 text-slate-600"
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
          <div className="mt-1.5 break-words text-lg font-semibold leading-tight text-slate-950">{value}</div>
          <div className="mt-1.5 text-xs leading-5 text-muted-foreground">{hint}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function NumberField({ label, value, onChange, disabled }: { label: string; value: number; onChange: (value: number) => void; disabled: boolean }) {
  return (
    <Field label={label}>
      <Input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} disabled={disabled} />
    </Field>
  );
}

function SettingSwitch({
  label,
  description,
  checked,
  onChange,
  disabled
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={cn("flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-4", disabled && "opacity-70")}>
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-200"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <span className="block text-sm font-bold text-slate-900">{label}</span>
        <span className="mt-1 block text-sm leading-5 text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className="min-w-0 break-words text-right text-sm font-bold text-slate-900">{value}</div>
    </div>
  );
}

function statusTone(status: EnvStatus) {
  if (status === "ok") return "success";
  if (status === "warning") return "warning";
  return "danger";
}

function statusLabel(status: EnvStatus) {
  if (status === "ok") return "Siap";
  if (status === "warning") return "Perlu dicek";
  return "Belum lengkap";
}

function formatUptime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours} jam ${minutes} menit`;
  return `${minutes} menit`;
}
