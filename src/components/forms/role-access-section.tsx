"use client";

import { Check, Eye, LockKeyhole, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { humanizeRole } from "@/lib/utils";

type RoleRow = { id: string; name: string; description?: string | null; permissions: string[]; _count?: { users?: number } };
type PermissionGroup = { label: string; permissions: Array<[string, string]> };

export function RoleAccessSection({ roles, groups, onSaved, createRequest = 0 }: { roles: RoleRow[]; groups: PermissionGroup[]; onSaved: () => Promise<void>; createRequest?: number }) {
  const toast = useToast();
  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [newRole, setNewRole] = useState({ name: "", description: "" });
  const [editRole, setEditRole] = useState({ name: "", description: "" });
  const [deleteTarget, setDeleteTarget] = useState<RoleRow | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const selectedPermissionCount = selected.filter((permission) => permission !== "visibility:configured").length;

  function open(role: RoleRow) {
    setEditing(role);
    setEditRole({ name: humanizeRole(role.name), description: role.description || "" });
    setSelected(role.permissions || []);
  }

  function openCreate() {
    setNewRole({ name: "", description: "" });
    setSelected([]);
    setCreating(true);
  }

  useEffect(() => { if (createRequest > 0) openCreate(); }, [createRequest]);

  function toggle(permission: string) {
    setSelected((current) => current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission]);
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    const response = await fetch("/api/master-data", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "roles", id: editing.id, ...editRole, permissions: selected }) });
    const json = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) return toast.push(json.error || "Gagal menyimpan hak akses role.", "error");
    toast.push(`Hak akses ${humanizeRole(editing.name)} berhasil diperbarui.`, "success");
    setEditing(null);
    await onSaved();
  }

  async function createRole(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const response = await fetch("/api/master-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "roles", ...newRole, permissions: selected })
    });
    const json = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) return toast.push(json.error || "Gagal menambahkan role.", "error");
    toast.push(`Role ${humanizeRole(json.data?.name || newRole.name)} berhasil ditambahkan.`, "success");
    setCreating(false);
    await onSaved();
  }

  async function deleteRole() {
    if (!deleteTarget) return;
    const response = await fetch("/api/master-data", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "roles", id: deleteTarget.id }) });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) return toast.push(json.error || "Role gagal dihapus.", "error");
    toast.push(`Role ${humanizeRole(deleteTarget.name)} berhasil dihapus.`, "success");
    setDeleteTarget(null);
    await onSaved();
  }

  function requestDeleteRole(role: RoleRow) {
    if (role.name === "SUPER_ADMIN") {
      toast.push("Role Super Admin dikunci dan tidak dapat dihapus.", "error");
      return;
    }
    const userCount = role._count?.users || 0;
    if (userCount > 0) {
      toast.push(`Role ${humanizeRole(role.name)} masih dipakai ${userCount} user. Ubah role user tersebut pada Daftar Pengguna terlebih dahulu.`, "error");
      return;
    }
    setEditing(null);
    setDeleteTarget(role);
  }

  const permissionFields = (disabled = false) => groups.map((group) => (
    <fieldset key={group.label} className={group.label === "Visibilitas Fitur" ? "rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 md:col-span-2" : "rounded-lg border border-slate-200 p-3"}>
      <legend className="px-1 text-sm font-bold text-slate-800">
        <span className="inline-flex items-center gap-1.5">{group.label === "Visibilitas Fitur" ? <Eye className="h-4 w-4 text-emerald-700" /> : null}{group.label}</span>
      </legend>
      {group.label === "Visibilitas Fitur" ? <p className="mb-2 px-2 text-xs leading-5 text-slate-500">Aktifkan untuk menampilkan fitur pada sidebar dan mengizinkan role membuka halamannya.</p> : null}
      <div className={group.label === "Visibilitas Fitur" ? "mt-1 grid gap-2 sm:grid-cols-2" : "mt-1 grid gap-2"}>
        {group.permissions.map(([value, label]) => (
          <label key={value} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50">
            <input type="checkbox" className="h-4 w-4 accent-emerald-700" checked={selected.includes(value)} disabled={disabled} onChange={() => toggle(value)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  ));

  return (
    <section className="rounded-xl border border-emerald-200 bg-white shadow-panel">
      <div className="flex flex-col gap-3 border-b border-emerald-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><ShieldCheck className="h-5 w-5" /></div>
          <div><h3 className="font-bold text-slate-950">Role & Hak Akses</h3><p className="mt-0.5 text-sm text-slate-500">Atur izin yang otomatis diterapkan kepada seluruh pengguna dalam role.</p></div>
        </div>
        <Badge tone="info">{roles.length} role</Badge>
      </div>
      <div className="overflow-x-auto p-5"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><th className="px-3 py-3">Nama Role</th><th className="px-3 py-3">Deskripsi</th><th className="px-3 py-3">Pengguna</th><th className="px-3 py-3">Hak Akses</th><th className="px-3 py-3 text-right">Aksi</th></tr></thead><tbody>{roles.map((role) => <tr key={role.id} className="border-b last:border-0 hover:bg-slate-50/70"><td className="px-3 py-3"><Badge tone={role.name === "SUPER_ADMIN" ? "success" : "info"}>{humanizeRole(role.name)}</Badge></td><td className="max-w-sm px-3 py-3 text-slate-500">{role.description || "Role pengguna ASCIT."}</td><td className="px-3 py-3"><div className="font-semibold text-slate-700">{role._count?.users || 0} user</div>{role._count?.users ? <div className="mt-0.5 text-[10px] font-medium text-amber-600">Pindahkan sebelum hapus</div> : null}</td><td className="px-3 py-3 font-semibold text-slate-700">{role.permissions.filter((permission) => permission !== "visibility:configured").length} izin aktif</td><td className="px-3 py-3"><div className="flex justify-end"><Button type="button" variant="outline" className="h-10 w-10 px-0" onClick={() => open(role)} title="Lihat dan atur role" aria-label={`Lihat dan atur role ${humanizeRole(role.name)}`}><Pencil className="h-4 w-4" /></Button></div></td></tr>)}</tbody></table></div>

      {creating ? <Modal title="Tambah Role" onClose={() => setCreating(false)}>
        <form onSubmit={createRole} className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nama Role">
              <Input value={newRole.name} onChange={(event) => setNewRole((current) => ({ ...current, name: event.target.value }))} placeholder="Contoh: Helpdesk" required minLength={2} maxLength={50} />
              <p className="mt-1 text-[11px] text-slate-500">Nama akan dibuat menjadi kode otomatis, misalnya Helpdesk menjadi HELPDESK.</p>
            </Field>
            <Field label="Deskripsi">
              <Textarea value={newRole.description} onChange={(event) => setNewRole((current) => ({ ...current, description: event.target.value }))} placeholder="Jelaskan fungsi role ini" />
            </Field>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between"><div className="text-sm font-bold text-slate-800">Pilih Hak Akses</div><Badge tone="info">{selectedPermissionCount} izin dipilih</Badge></div>
            <div className="grid max-h-[45vh] gap-4 overflow-y-auto pr-1 md:grid-cols-2">{permissionFields()}</div>
          </div>
          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => setCreating(false)}>Batal</Button><Button type="submit" disabled={saving || newRole.name.trim().length < 2}><Plus className="h-4 w-4" />{saving ? "Menyimpan..." : "Simpan Role"}</Button></div>
        </form>
      </Modal> : null}

      {editing ? <Modal title={`Hak Akses — ${humanizeRole(editing.name)}`} onClose={() => setEditing(null)}>
        <div className="grid gap-4">
          {editing.name === "SUPER_ADMIN" ? <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />Super Admin selalu memiliki seluruh izin dan tidak dapat diubah.</div> : null}
          {editing.name !== "SUPER_ADMIN" ? <div className="grid gap-4 md:grid-cols-2"><Field label="Nama Role"><Input value={editRole.name} onChange={(event) => setEditRole((current) => ({ ...current, name: event.target.value }))} minLength={2} maxLength={50} required /></Field><Field label="Deskripsi"><Textarea value={editRole.description} onChange={(event) => setEditRole((current) => ({ ...current, description: event.target.value }))} /></Field></div> : null}
          <div className="grid max-h-[55vh] gap-4 overflow-y-auto pr-1 md:grid-cols-2">{permissionFields(editing.name === "SUPER_ADMIN")}</div>
          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            {editing.name !== "SUPER_ADMIN" ? <Button type="button" variant="outline" className="text-red-600 hover:border-red-200 hover:bg-red-50" onClick={() => requestDeleteRole(editing)}><Trash2 className="h-4 w-4" />Hapus Role</Button> : <span />}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditing(null)}>Tutup</Button>{editing.name !== "SUPER_ADMIN" ? <Button type="button" disabled={saving} onClick={() => void save()}><Check className="h-4 w-4" />{saving ? "Menyimpan..." : "Simpan Hak Akses"}</Button> : null}</div>
          </div>
        </div>
      </Modal> : null}
      {deleteTarget ? <ConfirmDialog title="Hapus Role" message={`Hapus role ${humanizeRole(deleteTarget.name)}? Role hanya dapat dihapus bila tidak dipakai pengguna.`} confirmLabel="Ya, Hapus Role" variant="danger" onConfirm={deleteRole} onCancel={() => setDeleteTarget(null)} /> : null}
    </section>
  );
}
