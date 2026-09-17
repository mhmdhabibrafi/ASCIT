export enum Permission {
  VISIBILITY_CONFIGURED = "visibility:configured",
  FEATURE_DASHBOARD = "feature:dashboard",
  FEATURE_ASSETS = "feature:assets",
  FEATURE_VENDOR_ASSETS = "feature:vendor_assets",
  FEATURE_MUTATIONS = "feature:mutations",
  FEATURE_SERVICE_RECORDS = "feature:service_records",
  FEATURE_MONITORING_AI = "feature:monitoring_ai",
  FEATURE_REPORTS = "feature:reports",
  FEATURE_MASTER_DATA = "feature:master_data",
  FEATURE_USERS = "feature:users",
  FEATURE_AUDIT_LOG = "feature:audit_log",
  FEATURE_SETTINGS = "feature:settings",
  ASSET_CREATE = "asset:create",
  ASSET_READ = "asset:read",
  ASSET_UPDATE = "asset:update",
  ASSET_DELETE = "asset:delete",
  ASSET_EXPORT = "asset:export",
  MUTATION_CREATE = "mutation:create",
  MUTATION_APPROVE = "mutation:approve",
  MUTATION_READ = "mutation:read",
  MAINTENANCE_CREATE = "maintenance:create",
  MAINTENANCE_READ = "maintenance:read",
  MAINTENANCE_UPDATE = "maintenance:update",
  REPAIR_CREATE = "repair:create",
  REPAIR_READ = "repair:read",
  REPAIR_UPDATE = "repair:update",
  REPORT_READ = "report:read",
  REPORT_EXPORT = "report:export",
  USER_CREATE = "user:create",
  USER_READ = "user:read",
  USER_UPDATE = "user:update",
  USER_DELETE = "user:delete",
  MASTER_DATA_CREATE = "master_data:create",
  MASTER_DATA_UPDATE = "master_data:update",
  MASTER_DATA_DELETE = "master_data:delete",
  SYSTEM_ADMIN = "system:admin",
  SETTINGS_MANAGE = "settings:manage",
  AUDIT_LOG_READ = "audit_log:read",
  AI_ANALYZE = "ai:analyze",
  AI_MANAGE = "ai:manage"
}

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  SUPER_ADMIN: [...Object.values(Permission)],
  ADMIN_IT: [
    Permission.VISIBILITY_CONFIGURED, Permission.FEATURE_DASHBOARD, Permission.FEATURE_ASSETS, Permission.FEATURE_VENDOR_ASSETS, Permission.FEATURE_MUTATIONS,
    Permission.FEATURE_SERVICE_RECORDS, Permission.FEATURE_MONITORING_AI, Permission.FEATURE_REPORTS,
    Permission.FEATURE_MASTER_DATA, Permission.FEATURE_USERS, Permission.FEATURE_AUDIT_LOG, Permission.FEATURE_SETTINGS,
    Permission.ASSET_CREATE, Permission.ASSET_READ, Permission.ASSET_UPDATE, Permission.ASSET_DELETE, Permission.ASSET_EXPORT,
    Permission.MUTATION_CREATE, Permission.MUTATION_APPROVE, Permission.MUTATION_READ,
    Permission.MAINTENANCE_CREATE, Permission.MAINTENANCE_READ, Permission.MAINTENANCE_UPDATE,
    Permission.REPAIR_CREATE, Permission.REPAIR_READ, Permission.REPAIR_UPDATE,
    Permission.REPORT_READ, Permission.REPORT_EXPORT,
    Permission.USER_READ, Permission.USER_CREATE, Permission.USER_UPDATE, Permission.USER_DELETE,
    Permission.MASTER_DATA_CREATE, Permission.MASTER_DATA_UPDATE, Permission.MASTER_DATA_DELETE,
    Permission.SYSTEM_ADMIN, Permission.SETTINGS_MANAGE, Permission.AUDIT_LOG_READ, Permission.AI_ANALYZE, Permission.AI_MANAGE
  ],
  KEPALA_IT: [Permission.VISIBILITY_CONFIGURED, Permission.FEATURE_DASHBOARD, Permission.FEATURE_ASSETS, Permission.FEATURE_VENDOR_ASSETS, Permission.FEATURE_MUTATIONS, Permission.FEATURE_SERVICE_RECORDS, Permission.FEATURE_MONITORING_AI, Permission.FEATURE_REPORTS, Permission.FEATURE_MASTER_DATA, Permission.FEATURE_USERS, Permission.FEATURE_AUDIT_LOG, Permission.ASSET_READ, Permission.ASSET_EXPORT, Permission.MUTATION_READ, Permission.MUTATION_APPROVE, Permission.MAINTENANCE_READ, Permission.REPAIR_READ, Permission.REPORT_READ, Permission.REPORT_EXPORT, Permission.USER_READ, Permission.USER_CREATE, Permission.USER_UPDATE, Permission.USER_DELETE, Permission.MASTER_DATA_CREATE, Permission.MASTER_DATA_UPDATE, Permission.MASTER_DATA_DELETE, Permission.AUDIT_LOG_READ, Permission.AI_ANALYZE, Permission.AI_MANAGE],
  STAF_IT: [Permission.VISIBILITY_CONFIGURED, Permission.FEATURE_DASHBOARD, Permission.FEATURE_ASSETS, Permission.FEATURE_VENDOR_ASSETS, Permission.FEATURE_MUTATIONS, Permission.FEATURE_SERVICE_RECORDS, Permission.ASSET_READ, Permission.ASSET_CREATE, Permission.ASSET_UPDATE, Permission.MUTATION_CREATE, Permission.MAINTENANCE_CREATE, Permission.MAINTENANCE_READ, Permission.MAINTENANCE_UPDATE, Permission.REPAIR_CREATE, Permission.REPAIR_READ],
  MANAJEMEN: [Permission.VISIBILITY_CONFIGURED, Permission.FEATURE_DASHBOARD, Permission.FEATURE_ASSETS, Permission.FEATURE_VENDOR_ASSETS, Permission.FEATURE_REPORTS, Permission.FEATURE_AUDIT_LOG, Permission.ASSET_READ, Permission.REPORT_READ, Permission.REPORT_EXPORT, Permission.AUDIT_LOG_READ]
};

export const PERMISSION_GROUPS = [
  { label: "Visibilitas Fitur", permissions: [[Permission.FEATURE_DASHBOARD, "Tampilkan Dashboard"], [Permission.FEATURE_ASSETS, "Tampilkan Data Aset IT"], [Permission.FEATURE_VENDOR_ASSETS, "Tampilkan Data Asset Vendor"], [Permission.FEATURE_MUTATIONS, "Tampilkan Mutasi Aset"], [Permission.FEATURE_SERVICE_RECORDS, "Tampilkan Service Records"], [Permission.FEATURE_MONITORING_AI, "Tampilkan Monitoring & AI"], [Permission.FEATURE_REPORTS, "Tampilkan Laporan"], [Permission.FEATURE_MASTER_DATA, "Tampilkan Master Data"], [Permission.FEATURE_USERS, "Tampilkan Pengguna & Hak Akses"], [Permission.FEATURE_AUDIT_LOG, "Tampilkan Audit Log"], [Permission.FEATURE_SETTINGS, "Tampilkan Pengaturan"]] },
  { label: "Aset", permissions: [[Permission.ASSET_READ, "Lihat aset"], [Permission.ASSET_CREATE, "Tambah aset"], [Permission.ASSET_UPDATE, "Ubah aset"], [Permission.ASSET_DELETE, "Hapus aset"], [Permission.ASSET_EXPORT, "Ekspor aset"]] },
  { label: "Mutasi", permissions: [[Permission.MUTATION_READ, "Lihat mutasi"], [Permission.MUTATION_CREATE, "Buat mutasi"], [Permission.MUTATION_APPROVE, "Setujui mutasi"]] },
  { label: "Perawatan & perbaikan", permissions: [[Permission.MAINTENANCE_READ, "Lihat perawatan"], [Permission.MAINTENANCE_CREATE, "Tambah perawatan"], [Permission.MAINTENANCE_UPDATE, "Ubah perawatan"], [Permission.REPAIR_READ, "Lihat perbaikan"], [Permission.REPAIR_CREATE, "Tambah perbaikan"], [Permission.REPAIR_UPDATE, "Ubah perbaikan"]] },
  { label: "Laporan", permissions: [[Permission.REPORT_READ, "Lihat laporan"], [Permission.REPORT_EXPORT, "Ekspor laporan"]] },
  { label: "Pengguna", permissions: [[Permission.USER_READ, "Lihat pengguna"], [Permission.USER_CREATE, "Tambah pengguna"], [Permission.USER_UPDATE, "Ubah pengguna"], [Permission.USER_DELETE, "Hapus pengguna"]] },
  { label: "Master data", permissions: [[Permission.MASTER_DATA_CREATE, "Tambah master data"], [Permission.MASTER_DATA_UPDATE, "Ubah master data"], [Permission.MASTER_DATA_DELETE, "Hapus master data"]] },
  { label: "Sistem & AI", permissions: [[Permission.AI_ANALYZE, "Jalankan analisis Ollama"], [Permission.AI_MANAGE, "Kelola antrean & retry worker AI"], [Permission.SYSTEM_ADMIN, "Administrasi sistem"], [Permission.SETTINGS_MANAGE, "Kelola pengaturan"], [Permission.AUDIT_LOG_READ, "Lihat audit log"]] }
] as const;

export function normalizePermissions(value: unknown, roleName?: string): Permission[] {
  if (!Array.isArray(value)) return ROLE_PERMISSIONS[roleName || ""] || [];
  const allowed = new Set(Object.values(Permission));
  const normalized = [...new Set(value.map(String).filter((item): item is Permission => allowed.has(item as Permission)))];
  if (normalized.includes(Permission.VISIBILITY_CONFIGURED)) return normalized;

  const current = new Set(normalized);
  const inferred: Permission[] = [Permission.VISIBILITY_CONFIGURED];
  const addWhen = (feature: Permission, permissions: Permission[]) => {
    if (permissions.some((permission) => current.has(permission))) inferred.push(feature);
  };
  addWhen(Permission.FEATURE_DASHBOARD, [Permission.ASSET_READ]);
  addWhen(Permission.FEATURE_ASSETS, [Permission.ASSET_READ]);
  addWhen(Permission.FEATURE_VENDOR_ASSETS, [Permission.ASSET_READ]);
  addWhen(Permission.FEATURE_MUTATIONS, [Permission.MUTATION_READ, Permission.MUTATION_CREATE]);
  addWhen(Permission.FEATURE_SERVICE_RECORDS, [Permission.MAINTENANCE_READ, Permission.REPAIR_READ]);
  addWhen(Permission.FEATURE_MONITORING_AI, [Permission.ASSET_READ, Permission.AI_ANALYZE]);
  addWhen(Permission.FEATURE_REPORTS, [Permission.REPORT_READ]);
  addWhen(Permission.FEATURE_MASTER_DATA, [Permission.MASTER_DATA_CREATE, Permission.MASTER_DATA_UPDATE, Permission.MASTER_DATA_DELETE]);
  addWhen(Permission.FEATURE_USERS, [Permission.USER_READ]);
  addWhen(Permission.FEATURE_AUDIT_LOG, [Permission.AUDIT_LOG_READ]);
  addWhen(Permission.FEATURE_SETTINGS, [Permission.SETTINGS_MANAGE]);
  return [...new Set([...normalized, ...inferred])];
}

