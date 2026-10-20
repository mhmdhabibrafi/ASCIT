"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { CheckCircle2, Download, RefreshCw, ShieldCheck, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ReleaseNotes } from "./release-notes";

type Status = {
  ready: boolean; version: string; phase: string; message?: string; error?: string;
  busy?: boolean; backupReady?: boolean; checkedAt?: string;
  latest?: { version: string; notes: string; available: boolean; installable: boolean };
};
const stages = ["checking", "downloading", "building", "backup", "switching", "verifying"];
const stageLabels = ["Pemeriksaan rilis", "Unduh paket", "Persiapan sistem", "Pencadangan data", "Aktivasi versi", "Verifikasi layanan"];
export function UpdatePanel() {
  const { data: session, status: sessionStatus } = useSession();
  const allowed = session?.user.permissions?.includes("system:admin");
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [pending, setPending] = useState<"check" | "install" | null>(null);
  const [confirmVersion, setConfirmVersion] = useState<string | null>(null);
  const actionLock = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    const timeout = setTimeout(() => request.abort(), 10000);
    try {
      const response = await fetch("/api/system/updates", { cache: "no-store", signal: request.signal });
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (controller.current !== request) return;
      setStatus(result); setConnectionError("");
    } catch {
      if (controller.current === request) setConnectionError("Status layanan belum dapat dihubungi. Sistem akan mencoba menyambung kembali secara otomatis.");
    } finally { clearTimeout(timeout); }
  }, []);
  useEffect(() => {
    if (!allowed) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() { await refresh(); if (!disposed) timer = setTimeout(poll, 5000); }
    void poll();
    return () => { disposed = true; clearTimeout(timer); const request = controller.current; controller.current = null; request?.abort(); };
  }, [allowed, refresh]);
  async function action(name: "check" | "install", version?: string) {
    if (actionLock.current) return;
    actionLock.current = true;
    setConfirmVersion(null); setPending(name); setError("");
    try {
      const response = await fetch("/api/system/updates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: name, version }), signal: AbortSignal.timeout(135000)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Permintaan pembaruan tidak berhasil.");
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Permintaan gagal."); }
    finally { actionLock.current = false; setPending(null); }
  }
  if (sessionStatus === "loading") return <p role="status" className="text-sm text-slate-500">Memuat pengaturan pembaruan…</p>;
  if (!allowed) return <p className="text-sm text-slate-600">Pembaruan sistem hanya tersedia untuk administrator sistem.</p>;
  const busy = Boolean(pending || status?.busy);
  const available = status?.latest?.available;
  const failure = error || connectionError || status?.error;
  const title = failure || status?.phase === "failed" ? "Pembaruan memerlukan perhatian" : status?.busy ? "Pembaruan sedang berlangsung" : !status ? "Memuat status sistem" : !status.ready ? "Layanan pembaruan belum siap" : available ? "Pembaruan tersedia" : status.latest ? "Sistem menggunakan versi terbaru" : "Periksa ketersediaan pembaruan";
  const detail = status?.busy ? status.message : !status?.ready ? status?.message : available ? `Versi ${status.latest?.version} tersedia untuk dipasang pada server ini.` : status?.latest ? "Tidak ada versi yang lebih baru dari rilis resmi ASCIT." : "Periksa rilis resmi untuk mengetahui pembaruan yang tersedia.";
  const checked = status?.checkedAt && !Number.isNaN(Date.parse(status.checkedAt)) ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(status.checkedAt)) : "Belum diperiksa";
  return (
    <Card accent="none" className="overflow-hidden border border-slate-200 bg-white">
      <CardHeader className="gap-4 px-6 py-5">
        <div className="flex items-center gap-3"><span className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-slate-600"><RefreshCw size={20} /></span><div><CardTitle className="text-base font-semibold normal-case tracking-normal">Pembaruan Sistem</CardTitle><p className="mt-1 text-sm text-slate-500">Kelola versi dan pemeliharaan aplikasi ASCIT.</p></div></div>
      </CardHeader>
      <CardContent className="space-y-6 p-6">
        <dl className="grid gap-5 rounded-xl border border-slate-200 bg-slate-50/70 p-5 sm:grid-cols-3">
          {[ ["Versi terpasang", status?.version ? `v${status.version}` : "Memuat…"], ["Versi terbaru", status?.latest ? `v${status.latest.version}` : "Belum diperiksa"], ["Pemeriksaan terakhir", checked] ].map(([label, value]) => <div key={label}><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="mt-2 text-sm font-semibold text-slate-800">{value}</dd></div>)}
        </dl>
        <section className="space-y-4" aria-label="Status pembaruan">
          <div className="flex items-start gap-3" role="status"><span className={`mt-0.5 ${failure || status?.phase === "failed" ? "text-amber-600" : "text-emerald-700"}`}>{busy ? <RefreshCw size={21} className="animate-spin" /> : failure || status?.phase === "failed" ? <AlertCircle size={21} /> : <CheckCircle2 size={21} />}</span><div><h3 className="text-sm font-semibold text-slate-800">{pending === "check" ? "Memeriksa rilis terbaru" : title}</h3><p className="mt-1 text-sm leading-6 text-slate-500">{detail}</p></div></div>
          {failure && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800">{failure}</p>}
          {status?.ready && !status.backupReady && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Perangkat pencadangan database belum tersedia. Hubungi administrator server sebelum memasang pembaruan.</p>}
          {available && !status?.latest?.installable && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Paket instalasi Windows untuk rilis ini belum tersedia. Pemasangan dapat dilakukan setelah paket resmi diterbitkan.</p>}
          {status?.busy && <ol className="grid gap-2 rounded-lg bg-slate-50 p-4 sm:grid-cols-2">{stages.map((stage, index) => <li key={stage} className={`flex items-center gap-2 text-xs ${stages.indexOf(status.phase) >= index ? "font-semibold text-emerald-800" : "text-slate-400"}`}><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border">{index + 1}</span>{stageLabels[index]}{stage === status.phase && " · Berlangsung"}</li>)}</ol>}
          <div className="flex flex-wrap gap-3 pt-1">
            <Button variant="outline" disabled={!status?.ready || busy || Boolean(connectionError)} onClick={() => void action("check")}><RefreshCw size={15} className={pending === "check" ? "animate-spin" : ""} />{pending === "check" ? "Memeriksa…" : "Periksa Pembaruan"}</Button>
            {available && <Button disabled={!status?.ready || !status.backupReady || !status.latest?.installable || busy || Boolean(connectionError)} onClick={() => setConfirmVersion(status!.latest!.version)}><Download size={15} />Pasang Pembaruan</Button>}
            {status?.phase === "success" && <Button variant="outline" onClick={() => window.location.reload()}>Muat Ulang Halaman</Button>}
          </div>
        </section>
        <div className="flex items-start gap-2 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500"><ShieldCheck size={16} className="mt-0.5 shrink-0" /><p>Pembaruan diambil dari rilis resmi ASCIT di GitHub. Sistem tetap diakses melalui jaringan lokal. Database dicadangkan sebelum versi baru diaktifkan.</p></div>
        {status?.latest?.notes && <section className="border-t border-slate-200 pt-5"><div className="mb-5 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-slate-800">Catatan Rilis</h3><span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">v{status.latest.version}</span></div><ReleaseNotes notes={status.latest.notes} /></section>}
        {confirmVersion && <ConfirmDialog title={`Pasang ASCIT versi ${confirmVersion}?`} message="Sistem akan menyiapkan versi baru dan mencadangkan database. Akses web akan terhenti sementara saat aktivasi. Pastikan seluruh pengguna telah menyimpan pekerjaan mereka." confirmLabel="Pasang Pembaruan" variant="info" onCancel={() => setConfirmVersion(null)} onConfirm={() => void action("install", confirmVersion)} />}
      </CardContent>
    </Card>
  );
}
