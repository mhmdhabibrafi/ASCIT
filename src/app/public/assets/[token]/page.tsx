import { getServerSession } from "next-auth";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, CheckCircle2, ChevronRight, Clock3, Cpu, ExternalLink, HardDrive, Hospital, Laptop, MapPin, MemoryStick, PackageSearch, ShieldCheck, Tag, UserRound, Wrench } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { hospitalBrand, systemBrand } from "@/lib/branding";
import { prisma } from "@/lib/prisma";
import { formatDate, humanizeEnum } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const asset = await prisma.asset.findFirst({
    where: { deletedAt: null, OR: [{ qrToken: decodeURIComponent(token) }, { assetCode: decodeURIComponent(token) }] },
    select: { assetCode: true, assetName: true }
  });
  return {
    title: asset ? `${asset.assetCode} - ${asset.assetName}` : "Aset tidak ditemukan",
    description: asset ? `Informasi publik aset ${asset.assetName}` : "Informasi aset ASCIT"
  };
}

export default async function PublicAssetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const value = decodeURIComponent(token);
  const [asset, session] = await Promise.all([
    prisma.asset.findFirst({
      where: { deletedAt: null, OR: [{ qrToken: value }, { assetCode: value }] },
      include: {
        category: true,
        segment: true,
        brand: true,
        vendor: { select: { name: true } },
        unit: true,
        room: true,
        responsibleUser: { select: { name: true } },
        serviceRecords: {
          select: { id: true, type: true, status: true, scheduledDate: true, completedDate: true },
          orderBy: { createdAt: "desc" },
          take: 5
        }
      }
    }),
    getServerSession(authOptions)
  ]);
  if (!asset) notFound();

  const purchaseAge = asset.purchaseDate
    ? Math.max(0, new Date().getFullYear() - new Date(asset.purchaseDate).getFullYear())
    : null;
  const warrantyActive = Boolean(asset.warrantyEndDate && new Date(asset.warrantyEndDate) >= new Date());
  const details = [
    ["Kategori", asset.category?.name, Tag],
    ["Segmen", asset.segment?.name, PackageSearch],
    ["Merek", asset.brand?.name, Laptop],
    ["Model", asset.model, Laptop],
    ["Serial Number", asset.serialNumber, Tag],
    ["Sistem Operasi", asset.operatingSystem, Cpu],
    ["Prosesor", asset.processor, Cpu],
    ["RAM", asset.ram, MemoryStick],
    ["Penyimpanan", asset.storage, HardDrive],
    ["Tanggal Pembelian", asset.purchaseDate ? formatDate(asset.purchaseDate) : null, CalendarDays],
    ["Usia Aset", purchaseAge === null ? null : `${purchaseAge} tahun`, Clock3],
    ["Vendor", asset.vendor?.name, Hospital],
    ["Penanggung Jawab", asset.responsibleUser?.name, UserRound]
  ] as const;

  return (
    <main className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.13),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(14,116,144,0.09),transparent_35%)]" />
      <header className="relative z-10 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <Image src="/images/rs-awal-bros-logo.png" alt="RS Awal Bros" width={160} height={28} className="h-7 w-auto object-contain object-left" priority />
          <Link
            href={session ? "/dashboard" : `/login?callbackUrl=${encodeURIComponent(`/public/assets/${token}`)}`}
            className="ml-auto inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-700 px-3.5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2"
          >
            {session ? "Dashboard" : "Login"}<ExternalLink className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <div className="relative z-10 mx-auto flex-1 grid w-full max-w-6xl content-start gap-5 px-4 py-6 sm:px-6 sm:py-9">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_16px_45px_-28px_rgba(15,23,42,0.45)]">
          <div className="h-2 bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-600" />
          <div className="grid gap-5 p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">Aset terverifikasi</span>
                <span className="rounded-full bg-slate-100 px-3 py-1 font-mono text-xs font-bold text-slate-600">{asset.assetCode}</span>
              </div>
              <h1 className="mt-4 break-words text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{asset.assetName}</h1>
              <div className="mt-3 flex items-center flex-wrap gap-1.5 text-sm font-medium leading-6 text-slate-600">
                <MapPin className="h-4 w-4 shrink-0 text-emerald-600" />
                <span className="font-bold text-slate-800">{asset.unit?.name || "-"}</span>
                <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="font-semibold text-slate-600">{asset.room?.name || "-"}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:max-w-[320px] lg:justify-end">
              <Status label="Kondisi" value={humanizeEnum(asset.conditionStatus)} good={asset.conditionStatus === "BAIK"} />
              <Status label="Lifecycle" value={humanizeEnum(asset.lifecycleStatus)} good={asset.lifecycleStatus === "AKTIF"} />
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
              <PackageSearch className="h-5 w-5 text-emerald-700" />
              <h2 className="font-bold text-slate-950">Detail Aset</h2>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {details.map(([label, rawValue, Icon]) => (
                <div key={label} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.07em] text-slate-400"><Icon className="h-3.5 w-3.5" />{label}</div>
                  <div className="mt-2 break-words text-sm font-bold leading-5 text-slate-800">{rawValue || "-"}</div>
                </div>
              ))}
            </div>
          </div>

          <aside className="grid content-start gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-700" /><h2 className="font-bold">Garansi</h2></div>
              <div className={`mt-4 rounded-xl p-4 ${warrantyActive ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>
                <div className="flex items-center gap-2 text-sm font-bold">{warrantyActive ? <CheckCircle2 className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}{warrantyActive ? "Garansi aktif" : "Tidak aktif / tidak tersedia"}</div>
                <div className="mt-2 text-xs font-medium leading-5">{asset.warrantyStartDate ? formatDate(asset.warrantyStartDate) : "-"} — {asset.warrantyEndDate ? formatDate(asset.warrantyEndDate) : "-"}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2"><Wrench className="h-5 w-5 text-emerald-700" /><h2 className="font-bold">Riwayat Service</h2></div>
              <div className="mt-4 grid gap-2">
                {asset.serviceRecords.length ? asset.serviceRecords.map((record) => (
                  <div key={record.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-slate-800">{humanizeEnum(record.type)}</span><span className="text-[10px] font-bold text-slate-400">{humanizeEnum(record.status)}</span></div>
                    <div className="mt-1 text-xs text-slate-500">{record.completedDate ? formatDate(record.completedDate) : record.scheduledDate ? formatDate(record.scheduledDate) : "-"}</div>
                  </div>
                )) : <p className="rounded-xl bg-slate-50 p-4 text-sm font-medium text-slate-500">Belum ada riwayat service.</p>}
              </div>
            </div>
          </aside>
        </section>

        {session ? (
          <div className="mt-2 flex justify-center">
            <Link href={`/assets/${asset.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-200 bg-white px-5 py-2.5 text-sm font-bold text-emerald-700 shadow-sm hover:bg-emerald-50">Buka detail internal <ExternalLink className="h-4 w-4" /></Link>
          </div>
        ) : null}
      </div>

      <footer className="relative z-10 mt-auto border-t border-slate-200/90 bg-white py-5">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 text-center text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:text-left sm:px-6">
          <div>
            <span className="font-bold text-slate-600">Copyright &copy; {new Date().getFullYear()}</span>{" "}
            <span className="font-bold text-emerald-700">{hospitalBrand.name}</span>. All rights reserved.
          </div>
          <div className="font-medium text-slate-400">
            <b className="text-slate-600">{systemBrand.name}</b> v1.1.0
          </div>
        </div>
      </footer>
    </main>
  );
}

function Status({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${good ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
      <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">{label}</div>
      <div className={`mt-1 text-xs font-black ${good ? "text-emerald-700" : "text-amber-700"}`}>{value || "-"}</div>
    </div>
  );
}
