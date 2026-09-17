"use client";

import { Check, Clock3, MapPin, Plus, RefreshCw, X, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { MetricCard } from "@/components/ui/metric-card";
import { Modal } from "@/components/ui/modal";
import { EmptyPanel, PageHeader, PageStack } from "@/components/ui/page";
import { SearchBar } from "@/components/ui/search-bar";
import { MetricSkeleton, TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";

const emptyForm = {
  assetId: "",
  toUnitId: "",
  toRoomId: "",
  newResponsibleUserId: "",
  mutationDate: new Date().toISOString().slice(0, 10),
  reason: "",
  notes: "",
  lifecycleStatus: "DIPINDAHKAN"
};

function mutationSearchText(row: any) {
  return [
    row.asset?.assetCode,
    row.asset?.assetName,
    row.fromUnit?.name,
    row.fromRoom?.name,
    row.toUnit?.name,
    row.toRoom?.name,
    row.oldResponsibleUser?.name,
    row.newResponsibleUser?.name,
    row.reason,
    row.notes
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function MutationsClient() {
  const toast = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [master, setMaster] = useState<any>(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(10);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState("");
  const [viewMode, setViewMode] = useState<"active" | "history">("active");

  async function load() {
    setLoading(true);
    setVisibleCount(10);
    const [mutationRes, assetRes, masterRes] = await Promise.all([fetch("/api/mutations"), fetch("/api/assets"), fetch("/api/master-data")]);
    
    const mutData = (await mutationRes.json()).data || [];
    const assetData = (await assetRes.json()).data || [];
    const masterData = await masterRes.json();
    
    const manuallyMovedAssets = assetData.filter((a: any) => 
        a.lifecycleStatus === "DIPINDAHKAN" && !mutData.some((m: any) => m.assetId === a.id)
    );
    
    for (const a of manuallyMovedAssets) {
        mutData.push({
            id: "synthetic-" + a.id,
            assetId: a.id,
            asset: a,
            mutationDate: a.updatedAt,
            createdAt: a.updatedAt,
            reason: "Status aset diubah menjadi DIPINDAHKAN",
            fromUnit: null,
            fromRoom: null,
            toUnit: a.unit,
            toRoom: a.room,
            oldResponsibleUser: null,
            newResponsibleUser: a.responsibleUser,
            notes: "Pencatatan dari perubahan manual."
        });
    }

    setRows(mutData);
    setAssets(assetData);
    setMaster(masterData);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setVisibleCount(10);
  }, [search]);

  const rooms = useMemo(() => master?.rooms?.filter((room: any) => !form.toUnitId || room.unitId === form.toUnitId) || [], [master, form.toUnitId]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    
    if (isEditing) {
        const response = await fetch(`/api/assets/${editingAssetId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                unitId: form.toUnitId,
                roomId: form.toRoomId,
                responsibleUserId: form.newResponsibleUserId,
                lifecycleStatus: form.lifecycleStatus,
                notes: form.notes
            })
        });
        const json = await response.json();
        setSaving(false);
        if (!response.ok) {
            toast.push(json.error || "Gagal mengupdate aset.", "error");
            return;
        }
        toast.push("Data aset berhasil diupdate.", "success");
    } else {
        const response = await fetch("/api/mutations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form)
        });
        const json = await response.json();
        setSaving(false);
        if (!response.ok) {
            toast.push(json.error || "Gagal mencatat mutasi.", "error");
            return;
        }
        toast.push("Mutasi berhasil dicatat.", "success");
    }
    
    setShowForm(false);
    setForm(emptyForm);
    setIsEditing(false);
    await load();
  }

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return rows
      .filter((row) => {
          if (viewMode === "active") {
              return row.asset?.lifecycleStatus === "DIPINDAHKAN";
          }
          return true;
      })
      .filter((row) => !keyword || mutationSearchText(row).includes(keyword))
      .sort((a, b) => new Date(b.createdAt || b.mutationDate).getTime() - new Date(a.createdAt || a.mutationDate).getTime());
  }, [rows, search, viewMode]);

  function resetFilters() {
    setSearch("");
  }

  return (
    <PageStack>
      <PageHeader
        eyebrow="Operasional"
        title="Mutasi Aset"
        description="Catat dan pantau perpindahan lokasi aset, unit, atau perubahan penanggung jawab dengan mudah."
        actions={
          <Button type="button" onClick={() => {
              setIsEditing(false);
              setForm(emptyForm);
              setShowForm(true);
          }}>
            <Plus className="h-4 w-4" />
            Catat Mutasi
          </Button>
        }
      />

      {loading ? (
        <MetricSkeleton />
      ) : (
        <section className="grid gap-4 sm:grid-cols-2">
          <MetricCard icon={RefreshCw} label="Total mutasi dicatat" value={rows.length} hint="Seluruh perpindahan aset" />
          <MetricCard icon={Clock3} label="Mutasi terakhir" value={rows.length ? formatDate(rows[0].mutationDate) : "-"} hint="Data terbaru" />
        </section>
      )}

      {showForm ? (
        <Modal title={isEditing ? "Edit Mutasi Aset" : "Catat Mutasi Baru"} onClose={() => setShowForm(false)}>
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Aset">
                <Select value={form.assetId} onChange={(event) => setForm((prev) => ({ ...prev, assetId: event.target.value }))} required>
                  <option value="">Pilih aset</option>
                  {assets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.assetCode} - {asset.assetName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Unit tujuan">
                <Select value={form.toUnitId} onChange={(event) => setForm((prev) => ({ ...prev, toUnitId: event.target.value, toRoomId: "" }))} required>
                  <option value="">Pilih unit</option>
                  {master?.units?.map((unit: any) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Ruangan tujuan">
                <Select value={form.toRoomId} onChange={(event) => setForm((prev) => ({ ...prev, toRoomId: event.target.value }))} required>
                  <option value="">Pilih ruangan</option>
                  {rooms.map((room: any) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Penanggung jawab baru">
                <Select value={form.newResponsibleUserId} onChange={(event) => setForm((prev) => ({ ...prev, newResponsibleUserId: event.target.value }))}>
                  <option value="">Tidak berubah</option>
                  {master?.users?.map((user: any) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Tanggal mutasi">
                <Input type="date" value={form.mutationDate} onChange={(event) => setForm((prev) => ({ ...prev, mutationDate: event.target.value }))} required />
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {isEditing ? (
                 <Field label="Status Aset">
                   <Select value={form.lifecycleStatus} onChange={(event) => setForm((prev) => ({ ...prev, lifecycleStatus: event.target.value }))}>
                     <option value="DIPINDAHKAN">DIPINDAHKAN</option>
                     <option value="AKTIF">AKTIF</option>
                     <option value="RUSAK">RUSAK</option>
                     <option value="DIPERBAIKI">DIPERBAIKI</option>
                   </Select>
                 </Field>
              ) : null}
              <Field label={isEditing ? "Alasan / Keterangan Mutasi" : "Alasan mutasi"}>
                <Textarea value={form.reason} onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))} required={!isEditing} />
              </Field>
              <Field label="Catatan Aset (Notes)">
                <Textarea value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} />
              </Field>
            </div>
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : isEditing ? null : <Plus className="h-4 w-4" />}
                {isEditing ? "Simpan Perubahan" : "Simpan Mutasi"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle>Riwayat Mutasi</CardTitle>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Pantau pergerakan aset dan perubahan penanggung jawab.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={viewMode} onChange={(e) => setViewMode(e.target.value as any)} className="w-auto font-medium">
                <option value="active">Sedang Dipindahkan</option>
                <option value="history">Riwayat Lengkap</option>
              </Select>
              <Badge tone="info">{filteredRows.length} tampil</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          <SearchBar
            search={search}
            onSearchChange={setSearch}
            placeholder="Cari kode aset, nama aset, unit, ruangan, alasan, atau PIC..."
            onReset={resetFilters}
          />
          {loading ? <TableSkeleton /> : null}
          {!loading && !rows.length ? <EmptyPanel title="Belum ada mutasi" description="Catat mutasi pertama ketika aset berpindah unit atau ruangan." /> : null}
          {!loading && rows.length > 0 && !filteredRows.length ? (
            <EmptyPanel title="Tidak ada mutasi yang cocok" description="Ubah kata kunci pencarian Anda." />
          ) : null}
          {!loading && filteredRows.length > 0 && (
            <>
              <div className="grid gap-3">
                {filteredRows.slice(0, visibleCount).map((row) => (
                  <MutationItem 
                    key={row.id} 
                    row={row} 
                    onComplete={async (assetId) => {
                      if (!confirm("Tandai mutasi aset ini selesai? Aset akan kembali berstatus AKTIF dan hilang dari daftar ini.")) return;
                      await fetch(`/api/assets/${assetId}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ lifecycleStatus: "AKTIF" })
                      });
                      toast.push("Mutasi diselesaikan.", "success");
                      load();
                    }}
                    onDelete={async (assetId) => {
                      if (!confirm("Hapus / Batalkan mutasi ini? Aset akan kembali berstatus AKTIF.")) return;
                      await fetch(`/api/assets/${assetId}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ lifecycleStatus: "AKTIF" })
                      });
                      toast.push("Mutasi dibatalkan.", "success");
                      load();
                    }}
                    onEdit={(row) => {
                        setIsEditing(true);
                        setEditingAssetId(row.assetId);
                        setForm({
                            assetId: row.assetId,
                            toUnitId: row.toUnit?.id || row.asset?.unitId || "",
                            toRoomId: row.toRoom?.id || row.asset?.roomId || "",
                            newResponsibleUserId: row.newResponsibleUser?.id || row.asset?.responsibleUserId || "",
                            mutationDate: row.mutationDate ? new Date(row.mutationDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
                            reason: row.reason || "",
                            notes: row.notes || row.asset?.notes || "",
                            lifecycleStatus: row.asset?.lifecycleStatus || "DIPINDAHKAN"
                        });
                        setShowForm(true);
                    }}
                  />
                ))}
              </div>
              {visibleCount < filteredRows.length ? (
                <div className="mt-4 flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto font-bold border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                    onClick={() => setVisibleCount((prev) => prev + 10)}
                  >
                    Tampilkan Lebih Banyak ({filteredRows.length - visibleCount} item tersisa)
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </PageStack>
  );
}

function MutationItem({ row, onComplete, onDelete, onEdit }: { row: any, onComplete: (assetId: string) => void, onDelete: (assetId: string) => void, onEdit: (row: any) => void }) {
  return (
    <article className="grid max-w-full gap-3 overflow-hidden rounded-md border bg-white p-4 shadow-panel transition-all hover:border-emerald-200">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{formatDate(row.mutationDate)}</span>
            <Badge tone="warning">PROSES PINDAH</Badge>
          </div>
          <h3 className="mt-2 break-words text-sm font-semibold leading-snug text-slate-950">{row.asset?.assetCode || "-"} / {row.asset?.assetName || "-"}</h3>
          <p className="mt-1 max-w-3xl text-sm leading-5 text-muted-foreground">{row.reason || "Alasan belum diisi."}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
           <Button type="button" variant="outline" className="h-9 px-3 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200" onClick={() => onComplete(row.assetId)}>
             <Check className="h-4 w-4 mr-2" />
             Selesaikan
           </Button>
           <Button type="button" variant="outline" className="h-9 w-9 p-0" onClick={() => onEdit(row)} aria-label="Edit">
             <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-pencil"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>
           </Button>
           <Button type="button" variant="danger" className="h-9 w-9 p-0" onClick={() => onDelete(row.assetId)} aria-label="Hapus">
             <X className="h-4 w-4" />
           </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <LocationBlock title="Dari" unit={row.fromUnit?.name} room={row.fromRoom?.name} />
        <LocationBlock title="Tujuan" unit={row.toUnit?.name} room={row.toRoom?.name} />
      </div>

      {row.newResponsibleUser?.name ? (
        <div className="rounded-md border bg-slate-50 px-3 py-2 text-xs font-bold leading-5 text-muted-foreground">
          PIC baru: <span className="text-slate-800">{row.newResponsibleUser.name}</span>
        </div>
      ) : null}
    </article>
  );
}

function LocationBlock({ title, unit, room }: { title: string; unit?: string; room?: string }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-md border bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-slate-400">
        <MapPin className="h-4 w-4 text-emerald-700" />
        {title}
      </div>
      <div className="mt-2 break-words text-sm font-black leading-6 text-slate-800">{unit || "-"}</div>
      <div className="break-words text-sm leading-6 text-muted-foreground">{room || "-"}</div>
    </div>
  );
}
