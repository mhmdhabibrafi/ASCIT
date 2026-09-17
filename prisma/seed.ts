import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { settingDefinitions } from "../src/lib/system-settings";
import { ROLE_PERMISSIONS } from "../src/lib/permissions";

const prisma = new PrismaClient();

function date(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function scoreStatus(score: number) {
  if (score >= 80) return "PRIORITAS_PENGGANTIAN" as const;
  if (score >= 60) return "DIREKOMENDASIKAN_UPGRADE" as const;
  if (score >= 30) return "PERLU_DIPANTAU" as const;
  return "AMAN" as const;
}

function seedPassword(envName: string) {
  const value = process.env[envName]?.trim();
  const isPlaceholder = value ? /ganti|change-this|password/i.test(value) : true;
  if (value && !isPlaceholder && value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value)) {
    return value;
  }
  // Default password fallback for demo/dummy seeding
  return "DemoPassword123";
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DESTRUCTIVE_SEED !== "true") {
    throw new Error("Seed destruktif diblokir di production. Gunakan migration atau set ALLOW_DESTRUCTIVE_SEED=true secara eksplisit.");
  }
  await prisma.aiRecommendationDetail.deleteMany();
  await prisma.aiAssetRecommendation.deleteMany();
  await prisma.aiAnalysisRun.deleteMany();
  await prisma.assetReplacementRecommendation.deleteMany();
  await prisma.serviceRecord.deleteMany();
  await prisma.assetMutation.deleteMany();
  await prisma.assetLifecycleLog.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.systemSetting.deleteMany();
  await prisma.technician.deleteMany();
  await prisma.user.deleteMany();
  await prisma.room.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.assetCategory.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.role.deleteMany();

  const roleRows = await Promise.all(
    [
      ["SUPER_ADMIN", "Kontrol penuh seluruh sistem"],
      ["ADMIN_IT", "Admin operasional divisi IT Support"],
      ["STAF_IT", "Staff teknis maintenance dan perbaikan divisi IT Support"],
      ["KEPALA_IT", "Kepala IT untuk approval, monitoring, dan keputusan divisi IT Support"],
      ["MANAJEMEN", "Monitoring eksekutif dan laporan"]
    ].map(([name, description]) =>
      prisma.role.create({
        data: {
          name,
          description,
          permissions: ROLE_PERMISSIONS[name]
        }
      })
    )
  );
  const roles = Object.fromEntries(roleRows.map((role) => [role.name, role]));

  const password = async (plain: string) => bcrypt.hash(plain, 10);
  const users = await Promise.all([
    prisma.user.create({
      data: {
        email: "admin@ascit.local",
        name: "Admin IT Demo",
        passwordHash: await password(seedPassword("SEED_ADMIN_PASSWORD")),
        roleId: roles.ADMIN_IT.id
      }
    }),
    prisma.user.create({
      data: {
        email: "staf@ascit.local",
        name: "Staff IT Demo",
        passwordHash: await password(seedPassword("SEED_STAF_PASSWORD")),
        roleId: roles.STAF_IT.id
      }
    }),
    prisma.user.create({
      data: {
        email: "kepala@ascit.local",
        name: "Kepala IT Demo",
        passwordHash: await password(seedPassword("SEED_KEPALA_PASSWORD")),
        roleId: roles.KEPALA_IT.id
      }
    }),
    prisma.user.create({
      data: {
        email: "manajemen@ascit.local",
        name: "Manajemen Eksekutif Demo",
        passwordHash: await password(seedPassword("SEED_MANAJEMEN_PASSWORD")),
        roleId: roles.MANAJEMEN.id
      }
    })
  ]);
  const admin = users[0];
  const staf = users[1];

  await prisma.systemSetting.createMany({
    data: settingDefinitions.map((definition) => ({
      key: definition.key,
      value: definition.defaultValue as Prisma.InputJsonValue,
      description: definition.description
    }))
  });

  // UNIT DUMMY (Generic Synthetic Sample Units)
  const unitRows = await Promise.all(
    [
      ["Pelayanan Umum", "PU"],
      ["Farmasi & Apotek", "FA"],
      ["Kasir & Keuangan", "KK"],
      ["Laboratorium Terpadu", "LAB"],
      ["Radiologi & Diagnostik", "RAD"],
      ["Poliklinik Rawat Jalan", "POL"],
      ["Rawat Inap Utama", "RIU"],
      ["Departemen IT", "IT"]
    ].map(([name, code]) => prisma.unit.create({ data: { name, code } }))
  );
  const units = Object.fromEntries(unitRows.map((unit) => [unit.name, unit]));

  // RUANGAN DUMMY (Generic Synthetic Rooms)
  const roomSpecs = [
    // Pelayanan Umum
    ["Pelayanan Umum", "Loket Pelayanan 1", "PU_LK1"],
    ["Pelayanan Umum", "Loket Pelayanan 2", "PU_LK2"],
    
    // Farmasi
    ["Farmasi & Apotek", "Ruang Dispensing 1", "FA_DSP1"],
    ["Farmasi & Apotek", "Gudang Obat", "FA_GDG"],
    
    // Kasir
    ["Kasir & Keuangan", "Loket Kasir 1", "KK_LK1"],
    ["Kasir & Keuangan", "Loket Kasir 2", "KK_LK2"],
    
    // Laboratorium
    ["Laboratorium Terpadu", "Ruang Sampling", "LAB_SMP"],
    ["Laboratorium Terpadu", "Ruang Analisis", "LAB_ANL"],
    
    // Radiologi
    ["Radiologi & Diagnostik", "Ruang X-Ray", "RAD_XR1"],
    ["Radiologi & Diagnostik", "Ruang Baca Hasil", "RAD_BCA"],
    
    // Poliklinik
    ["Poliklinik Rawat Jalan", "Ruang Konsultasi 1", "POL_KS1"],
    ["Poliklinik Rawat Jalan", "Ruang Konsultasi 2", "POL_KS2"],
    ["Poliklinik Rawat Jalan", "Nurse Station Poli", "POL_NS"],
    
    // Rawat Inap
    ["Rawat Inap Utama", "Nurse Station Lantai 1", "RIU_NS1"],
    ["Rawat Inap Utama", "Nurse Station Lantai 2", "RIU_NS2"],
    ["Rawat Inap Utama", "Nurse Station Lantai 3", "RIU_NS3"],
    ["Rawat Inap Utama", "Ruang Isolasi", "RIU_ISO"],
    ["Rawat Inap Utama", "Ruang Tindakan Medis", "RIU_TDK"],
    
    // IT
    ["Departemen IT", "Ruang Kantor IT", "IT_OFF"],
    ["Departemen IT", "Ruang Server Utama", "IT_SRV"],
    ["Departemen IT", "Ruang Workshop & Perbaikan", "IT_WKP"]
  ];
  const roomRows = await Promise.all(
    roomSpecs.map(([unitName, name, code]) =>
      prisma.room.create({
        data: {
          name,
          code,
          unitId: units[unitName].id
        }
      })
    )
  );
  const rooms = Object.fromEntries(
    roomRows.map((room) => {
      const unit = unitRows.find((u) => u.id === room.unitId);
      return [`${unit?.name}_${room.name}`, room];
    })
  );

  const categoryRows = await Promise.all(
    [
      "Komputer",
      "Laptop",
      "Printer",
      "Scanner",
      "Access Point",
      "Switch",
      "UPS",
      "CCTV",
      "Server",
      "Perangkat Antrian"
    ].map((name, index) =>
      prisma.assetCategory.create({
        data: {
          name,
          code: `CAT-${String(index + 1).padStart(2, "0")}`
        }
      })
    )
  );
  const categories = Object.fromEntries(categoryRows.map((category) => [category.name, category]));

  const brandRows = await Promise.all(
    ["Lenovo", "HP", "Epson", "TP Link", "Dell", "Acer", "Canon", "Cisco", "APC", "Hikvision"].map((name) =>
      prisma.brand.create({ data: { name } })
    )
  );
  const brands = Object.fromEntries(brandRows.map((brand) => [brand.name, brand]));

  // VENDOR DUMMY (Generic Synthetic Companies)
  const vendorRows = await Promise.all(
    [
      "PT Solusi Komputindo Utama",
      "PT Mitra Jaringan Nusantara",
      "CV Media Print Perkasa",
      "PT Infrastruktur Cloud Data",
      "CV Keamanan Sistem Visual",
      "PT Layanan Terpadu Mandiri",
      "CV Mitra Maintenance IT",
      "PT Hardware Persada Jaya"
    ].map((name, index) =>
      prisma.vendor.create({
        data: {
          name,
          contact: `Kontak Narahubung ${index + 1}`,
          phone: `0812-9900-00${String(index + 1).padStart(2, "0")}`,
          email: `info.vendor${index + 1}@sample-vendor.test`,
          address: `Kawasan Niaga Teknologi Blok ${index + 1}`
        }
      })
    )
  );
  const vendors = Object.fromEntries(vendorRows.map((vendor) => [vendor.name, vendor]));

  // TEKNISI DUMMY (Generic Synthetic Technician Names)
  await Promise.all(
    [
      ["Budi Santoso (Teknisi Demo)", "Spesialis Komputer & Printer"],
      ["Rina Mahendra (Teknisi Demo)", "Spesialis Jaringan & Internet"],
      ["Fajar Pratama (Teknisi Demo)", "Spesialis Server & Data Center"],
      ["Dewi Kartika (Teknisi Demo)", "Spesialis CCTV & Hardware Periferal"]
    ].map(([name, specialty]) => prisma.technician.create({ data: { name, specialty } }))
  );

  // ASSET DUMMY (100% Synthetic Dummy Data, Demo IP Range 10.99.x.x, Fake Serials)
  const assetsInput = [
    ["AST-PC-DEMO-001", "PC Layanan Loket 1", "Komputer", "Lenovo", "ThinkCentre M720", "SN-DEMO-PC-001", "Pelayanan Umum", "Loket Pelayanan 1", "Intel Core i5 Gen 8", "8 GB", "SSD 256 GB", "Windows 11", "2023-01-10", "2026-07-20", "BAIK", "AKTIF", "10.99.1.10", "02:99:AA:BB:00:01"],
    ["AST-PC-DEMO-002", "PC Operasional Farmasi 1", "Komputer", "HP", "ProDesk 400 G4", "SN-DEMO-PC-002", "Farmasi & Apotek", "Ruang Dispensing 1", "Intel Pentium G4560", "4 GB", "HDD 500 GB", "Windows 10", "2018-02-12", "2021-02-12", "LAYAK_GANTI", "LAYAK_GANTI", "10.99.1.21", "02:99:AA:BB:00:02"],
    ["AST-PRN-DEMO-003", "Printer Label Obat", "Printer", "Epson", "L3210", "SN-DEMO-PRN-003", "Farmasi & Apotek", "Ruang Dispensing 1", "Tidak Ada", "Tidak Ada", "Tidak Ada", "Tidak Ada", "2022-05-15", "2026-07-07", "BAIK", "AKTIF", "10.99.1.22", "02:99:AA:BB:00:03"],
    ["AST-AP-DEMO-004", "Access Point Koridor Poli", "Access Point", "TP Link", "EAP225", "SN-DEMO-AP-004", "Poliklinik Rawat Jalan", "Ruang Konsultasi 1", "Tidak Ada", "Tidak Ada", "Tidak Ada", "Firmware AP v2.1", "2021-03-20", "2024-03-20", "RUSAK_RINGAN", "DALAM_PERBAIKAN", "10.99.1.31", "02:99:AA:BB:00:04"],
    ["AST-SRV-DEMO-005", "Server Database Aplikasi Demo", "Server", "Dell", "PowerEdge R440", "SN-DEMO-SRV-005", "Departemen IT", "Ruang Server Utama", "Intel Xeon Silver", "32 GB", "SSD 1 TB", "Linux Server 24.04", "2020-01-22", "2025-01-22", "BAIK", "AKTIF", "10.99.20.12", "02:99:AA:BB:00:05"],
    ["AST-LPT-DEMO-006", "Laptop Operasional Tim IT", "Laptop", "HP", "ProBook 440 G8", "SN-DEMO-LPT-006", "Departemen IT", "Ruang Kantor IT", "Intel Core i7 Gen 11", "16 GB", "SSD 512 GB", "Windows 11 Pro", "2024-02-12", "2027-02-12", "BAIK", "AKTIF", "10.99.1.42", "02:99:AA:BB:00:06"],
    ["AST-SCN-DEMO-007", "Scanner Dokumen Rekam Medis", "Scanner", "Canon", "DR-C240", "SN-DEMO-SCN-007", "Pelayanan Umum", "Loket Pelayanan 2", "Tidak Ada", "Tidak Ada", "Tidak Ada", "Tidak Ada", "2020-07-18", "2023-07-18", "RUSAK_BERAT", "LAYAK_GANTI", "", ""],
    ["AST-SW-DEMO-008", "Switch Core Distribusi Rack", "Switch", "Cisco", "CBS350-24T", "SN-DEMO-SW-008", "Departemen IT", "Ruang Server Utama", "Tidak Ada", "Tidak Ada", "Tidak Ada", "Firmware Switch v4", "2021-11-02", "2026-07-18", "BAIK", "AKTIF", "10.99.10.2", "02:99:AA:BB:00:08"],
    ["AST-UPS-DEMO-009", "UPS Rack Server 1500VA", "UPS", "APC", "Smart-UPS 1500VA", "SN-DEMO-UPS-009", "Departemen IT", "Ruang Server Utama", "Tidak Ada", "Tidak Ada", "Tidak Ada", "Tidak Ada", "2019-10-10", "2022-10-10", "RUSAK_RINGAN", "MAINTENANCE", "", ""],
    ["AST-CCTV-DEMO-010", "CCTV Pemantau Koridor Utama", "CCTV", "Hikvision", "DS-2CD2143", "SN-DEMO-CCTV-010", "Rawat Inap Utama", "Nurse Station Lantai 2", "Tidak Ada", "Tidak Ada", "NVR Demo", "Firmware CCTV v5", "2023-08-09", "2026-08-09", "BAIK", "AKTIF", "10.99.2.18", "02:99:AA:BB:00:10"],
    ["AST-PC-DEMO-011", "PC Terminal Kasir 1", "Komputer", "Acer", "Veriton X", "SN-DEMO-PC-011", "Kasir & Keuangan", "Loket Kasir 1", "Intel Core i5 Gen 9", "8 GB", "SSD 256 GB", "Windows 10", "2022-09-01", "2026-07-06", "BAIK", "AKTIF", "10.99.1.51", "02:99:AA:BB:00:11"],
    ["AST-PRN-DEMO-012", "Printer Barcode Spesimen Lab", "Printer", "Epson", "L3210", "SN-DEMO-PRN-012", "Laboratorium Terpadu", "Ruang Sampling", "Tidak Ada", "Tidak Ada", "Tidak Ada", "Tidak Ada", "2024-06-05", "2027-06-05", "BAIK", "AKTIF", "10.99.4.22", "02:99:AA:BB:00:12"],
    ["AST-AP-DEMO-013", "Access Point Lobby Utama", "Access Point", "TP Link", "EAP610", "SN-DEMO-AP-013", "Poliklinik Rawat Jalan", "Ruang Konsultasi 2", "Tidak Ada", "Tidak Ada", "Tidak Ada", "Firmware AP v3", "2023-05-25", "2026-05-25", "BAIK", "AKTIF", "10.99.1.33", "02:99:AA:BB:00:13"],
    ["AST-LPT-DEMO-014", "Laptop Dokter Jaga", "Laptop", "Lenovo", "ThinkPad E14", "SN-DEMO-LPT-014", "Rawat Inap Utama", "Nurse Station Lantai 1", "Intel Core i5 Gen 10", "8 GB", "SSD 512 GB", "Windows 11", "2025-01-17", "2028-01-17", "BAIK", "AKTIF", "10.99.5.14", "02:99:AA:BB:00:14"],
    ["AST-PC-DEMO-015", "PC Viewer Hasil Diagnostik", "Komputer", "HP", "EliteDesk 800", "SN-DEMO-PC-015", "Radiologi & Diagnostik", "Ruang X-Ray", "Intel Core i7 Gen 7", "8 GB", "HDD 1 TB", "Windows 10", "2019-04-04", "2022-04-04", "RUSAK_RINGAN", "AKTIF", "10.99.6.10", "02:99:AA:BB:00:15"],
    ["AST-PC-DEMO-016", "PC Administrasi Hasil Lab", "Komputer", "Lenovo", "ThinkCentre M710", "SN-DEMO-PC-016", "Laboratorium Terpadu", "Ruang Analisis", "Intel Core i3 Gen 6", "4 GB", "HDD 500 GB", "Windows 10", "2017-09-11", "2020-09-11", "LAYAK_GANTI", "LAYAK_GANTI", "10.99.4.10", "02:99:AA:BB:00:16"],
    ["AST-PRN-DEMO-017", "Printer Kwitansi Kasir", "Printer", "Epson", "LQ-310", "SN-DEMO-PRN-017", "Kasir & Keuangan", "Loket Kasir 2", "Tidak Ada", "Tidak Ada", "Tidak Ada", "Tidak Ada", "2021-12-01", "2024-12-01", "RUSAK_RINGAN", "DALAM_PERBAIKAN", "10.99.1.55", "02:99:AA:BB:00:17"],
    ["AST-AP-DEMO-018", "Access Point Ruang Rawat", "Access Point", "TP Link", "EAP245", "SN-DEMO-AP-018", "Rawat Inap Utama", "Nurse Station Lantai 2", "Tidak Ada", "Tidak Ada", "Tidak Ada", "Firmware AP", "2020-06-21", "2023-06-21", "RUSAK_RINGAN", "MAINTENANCE", "10.99.2.33", "02:99:AA:BB:00:18"],
    ["AST-SRV-DEMO-019", "Server Arsip & Cadangan", "Server", "Dell", "PowerEdge T440", "SN-DEMO-SRV-019", "Departemen IT", "Ruang Server Utama", "Intel Xeon Bronze", "64 GB", "RAID SSD 4 TB", "Ubuntu Server 24.04", "2021-01-14", "2026-07-25", "BAIK", "AKTIF", "10.99.20.20", "02:99:AA:BB:00:19"],
    ["AST-UPS-DEMO-020", "UPS Pelayanan Pendaftaran", "UPS", "APC", "Back-UPS 1200VA", "SN-DEMO-UPS-020", "Pelayanan Umum", "Loket Pelayanan 1", "Tidak Ada", "Tidak Ada", "Tidak Ada", "Tidak Ada", "2022-11-30", "2025-11-30", "BAIK", "AKTIF", "", ""],
    ["AST-CCTV-DEMO-021", "CCTV Pemantau Apotek", "CCTV", "Hikvision", "DS-2CD1023G0", "SN-DEMO-CCTV-021", "Farmasi & Apotek", "Gudang Obat", "Tidak Ada", "Tidak Ada", "NVR Demo", "Firmware CCTV", "2022-06-25", "2026-07-10", "BAIK", "AKTIF", "10.99.2.21", "02:99:AA:BB:00:21"],
    ["AST-SCN-DEMO-022", "Scanner Dokumen Klaim", "Scanner", "Canon", "LiDE 400", "SN-DEMO-SCN-022", "Radiologi & Diagnostik", "Ruang Baca Hasil", "Tidak Ada", "Tidak Ada", "Tidak Ada", "Tidak Ada", "2023-10-12", "2026-10-12", "BAIK", "AKTIF", "", ""],
    ["AST-ANTRI-DEMO-023", "Kiosk Tiket Antrian Pasien", "Perangkat Antrian", "Lenovo", "Kiosk Touch 21", "SN-DEMO-ANTRI-023", "Pelayanan Umum", "Loket Pelayanan 1", "Intel Core i3 Gen 4", "4 GB", "HDD 500 GB", "Windows 10", "2018-12-14", "2021-12-14", "LAYAK_GANTI", "LAYAK_GANTI", "10.99.3.10", "02:99:AA:BB:00:23"],
    ["AST-PC-DEMO-024", "PC Nurse Station Poli", "Komputer", "Acer", "Veriton M", "SN-DEMO-PC-024", "Poliklinik Rawat Jalan", "Nurse Station Poli", "Intel Core i5 Gen 8", "8 GB", "SSD 256 GB", "Windows 11", "2023-03-16", "2026-03-16", "BAIK", "AKTIF", "10.99.7.10", "02:99:AA:BB:00:24"],
    ["AST-LPT-DEMO-025", "Laptop Inspeksi Aset IT", "Laptop", "HP", "EliteBook 840", "SN-DEMO-LPT-025", "Departemen IT", "Ruang Workshop & Perbaikan", "Intel Core i5 Gen 12", "16 GB", "SSD 512 GB", "Windows 11", "2025-05-08", "2028-05-08", "BAIK", "AKTIF", "10.99.1.45", "02:99:AA:BB:00:25"]
  ] as const;

  const createdAssets = [];
  for (const [index, item] of assetsInput.entries()) {
    const [
      assetCode,
      assetName,
      categoryName,
      brandName,
      model,
      serialNumber,
      unitName,
      roomName,
      processor,
      ram,
      storage,
      operatingSystem,
      purchaseDate,
      warrantyEndDate,
      conditionStatus,
      lifecycleStatus,
      ipAddress,
      macAddress
    ] = item;
    const qrToken = `ASCIT-${assetCode}`;
    const qrCodeUrl = await QRCode.toDataURL(`${process.env.NEXTAUTH_URL || "http://localhost:3000"}/public/assets/${encodeURIComponent(qrToken)}`);
    const asset = await prisma.asset.create({
      data: {
        assetCode,
        assetName,
        categoryId: categories[categoryName].id,
        brandId: brands[brandName].id,
        vendorId:
          vendors[
            categoryName === "Printer"
              ? "CV Media Print Perkasa"
              : categoryName === "Access Point" || categoryName === "Switch"
                ? "PT Mitra Jaringan Nusantara"
                : categoryName === "Server"
                  ? "PT Infrastruktur Cloud Data"
                  : categoryName === "CCTV"
                    ? "CV Keamanan Sistem Visual"
                    : categoryName === "Perangkat Antrian"
                      ? "PT Layanan Terpadu Mandiri"
                      : "PT Solusi Komputindo Utama"
          ].id,
        unitId: units[unitName].id,
        roomId: rooms[`${unitName}_${roomName}`].id,
        responsibleUserId: staf.id,
        model,
        serialNumber,
        ipAddress: ipAddress || null,
        macAddress: macAddress || null,
        operatingSystem,
        processor,
        ram,
        storage,
        purchaseDate: date(purchaseDate),
        purchasePrice: 4500000 + index * 275000,
        invoiceNumber: `INV-DEMO-${String(index + 1).padStart(3, "0")}`,
        warrantyStartDate: date(purchaseDate),
        warrantyEndDate: date(warrantyEndDate),
        conditionStatus: conditionStatus as Prisma.AssetCreateInput["conditionStatus"],
        lifecycleStatus: lifecycleStatus as Prisma.AssetCreateInput["lifecycleStatus"],
        qrToken,
        qrCodeUrl,
        notes: "Data sampel dummy untuk demonstrasi dan evaluasi sistem ASCIT.",
        createdById: admin.id,
        lifecycleLogs: {
          create: {
            status: lifecycleStatus as Prisma.AssetLifecycleLogCreateWithoutAssetInput["status"],
            description: "Status awal perangkat dari data seed dummy.",
            createdById: admin.id
          }
        }
      }
    });
    createdAssets.push(asset);
  }
  const assets = Object.fromEntries(createdAssets.map((asset) => [asset.assetCode, asset]));

  const mutationAssets = createdAssets.slice(0, 10);
  for (const [index, asset] of mutationAssets.entries()) {
    const toUnit = unitRows[(index + 2) % unitRows.length];
    const toRoom = roomRows.find((room) => room.unitId === toUnit.id) ?? roomRows[0];
    const status = index % 4 === 0 ? "MENUNGGU" : index % 5 === 0 ? "DITOLAK" : "DISETUJUI";
    await prisma.assetMutation.create({
      data: {
        assetId: asset.id,
        fromUnitId: asset.unitId || unitRows[0].id,
        fromRoomId: asset.roomId || roomRows[0].id,
        toUnitId: toUnit.id,
        toRoomId: toRoom.id,
        oldResponsibleUserId: staf.id,
        newResponsibleUserId: users[index % users.length].id,
        mutationDate: date(`2026-0${(index % 5) + 1}-1${index % 9}`),
        reason: "Penyesuaian kebutuhan operasional ruangan unit.",
        approvalStatus: status as Prisma.AssetMutationCreateInput["approvalStatus"],
        approvedById: status === "MENUNGGU" ? null : users[2].id,
        approvedAt: status === "MENUNGGU" ? null : date("2026-06-01"),
        notes: "Data mutasi aset contoh simulasi.",
        createdById: admin.id
      }
    });
  }

  for (const [index, asset] of createdAssets.slice(0, 15).entries()) {
    await prisma.serviceRecord.create({
      data: {
        assetId: asset.id,
        type: "PREVENTIVE",
        status: "SELESAI",
        scheduledDate: date(`2026-${String((index % 6) + 1).padStart(2, "0")}-20`),
        completedDate: date(`2026-${String((index % 6) + 1).padStart(2, "0")}-22`),
        technicianName: ["Budi Santoso (Teknisi Demo)", "Rina Mahendra (Teknisi Demo)", "Fajar Pratama (Teknisi Demo)", "Dewi Kartika (Teknisi Demo)"][index % 4],
        notes: "Pemeliharaan preventif berkala berkondisi normal sesuai SOP.",
        cost: index % 4 === 0 ? 175000 : 50000,
        createdById: staf.id
      }
    });
  }

  const repairSpecs = [
    ["AST-PC-DEMO-002", "Boot lambat dan response OS berat", 350000, "LAYAK_GANTI"],
    ["AST-PC-DEMO-002", "Harddisk sektor lambat", 450000, "LAYAK_GANTI"],
    ["AST-PC-DEMO-002", "Penggunaan RAM melebihi kapasitas", 275000, "LAYAK_GANTI"],
    ["AST-PC-DEMO-002", "Aplikasi perkantoran sering terhenti", 200000, "LAYAK_GANTI"],
    ["AST-AP-DEMO-004", "Konektivitas sinyal nirkabel tidak stabil", 180000, "DALAM_PERBAIKAN"],
    ["AST-SCN-DEMO-007", "Hasil pemindaian optik bergaris", 650000, "LAYAK_GANTI"],
    ["AST-UPS-DEMO-009", "Kapasitas cadangan baterai menurun", 850000, "MAINTENANCE"],
    ["AST-PC-DEMO-015", "Kipas pendingin prosesor bising", 250000, "AKTIF"],
    ["AST-PC-DEMO-016", "Sistem operasi memerlukan peningkatan", 400000, "LAYAK_GANTI"],
    ["AST-PRN-DEMO-017", "Penarik kertas roller macet", 150000, "DALAM_PERBAIKAN"],
    ["AST-AP-DEMO-018", "Perangkat sering melakukan restart berkala", 220000, "MAINTENANCE"],
    ["AST-ANTRI-DEMO-023", "Panel layar sentuh kurang responsif", 1200000, "LAYAK_GANTI"]
  ] as const;

  for (const [index, [assetCode, symptoms, cost, finalStatus]] of repairSpecs.entries()) {
    await prisma.serviceRecord.create({
      data: {
        assetId: assets[assetCode].id,
        type: "CORRECTIVE",
        status: finalStatus === "DALAM_PERBAIKAN" ? "SEDANG_DIKERJAKAN" : "SELESAI",
        scheduledDate: date(`2026-${String((index % 6) + 1).padStart(2, "0")}-0${(index % 8) + 1}`),
        completedDate: finalStatus === "DALAM_PERBAIKAN" ? null : date("2026-06-10"),
        symptoms: `${symptoms}. Dilaporkan untuk pemeriksaan teknis.`,
        actionTaken: "Pemeriksaan komponen hardware, pembersihan debu, dan pengetesan beban kerja.",
        replacedComponents: index % 3 === 0 ? "Modul RAM / Media Simpan / Baterai Cadangan" : null,
        cost: cost,
        technicianName: ["Budi Santoso (Teknisi Demo)", "Rina Mahendra (Teknisi Demo)", "Fajar Pratama (Teknisi Demo)"][index % 3],
        createdById: staf.id
      }
    });
  }

  const aiRun = await prisma.aiAnalysisRun.create({
    data: {
      runCode: "AI-RUN-DEMO-001",
      year: 2027,
      totalAssets: 10,
      model: process.env.OPENMODEL_MODEL || "deepseek-v4-flash",
      summary: "Analisis simulasi menunjukkan beberapa perangkat kerja operasional dengan frekuensi servis tinggi disarankan untuk peremajaan komponen atau pengadaan unit baru pada periode anggaran mendatang.",
      createdById: admin.id
    }
  });

  const aiTargetCodes = [
    "AST-PC-DEMO-002",
    "AST-AP-DEMO-004",
    "AST-SCN-DEMO-007",
    "AST-UPS-DEMO-009",
    "AST-PC-DEMO-015",
    "AST-PC-DEMO-016",
    "AST-PRN-DEMO-017",
    "AST-AP-DEMO-018",
    "AST-SRV-DEMO-019",
    "AST-ANTRI-DEMO-023"
  ];

  for (const [index, code] of aiTargetCodes.entries()) {
    const asset = assets[code];
    const score = [92, 47, 86, 55, 63, 96, 44, 58, 31, 100][index];
    const recommendationTypes =
      score >= 80
        ? ["GANTI_PERANGKAT"]
        : score >= 60
          ? ["UPGRADE_PROCESSOR", "UPGRADE_RAM"]
          : [];
    await prisma.assetReplacementRecommendation.create({
      data: {
        assetId: asset.id,
        score,
        status: scoreStatus(score),
        recommendationTypes: recommendationTypes as unknown as Prisma.AssetReplacementRecommendationCreaterecommendationTypesInput,
        reason: score >= 80 
          ? "Skor risiko tinggi akibat akumulasi usia pakai lebih dari 5 tahun, riwayat servis korektif berulang, dan spesifikasi yang sudah tidak mendukung standar aplikasi kerja saat ini."
          : score >= 60
            ? "Kapasitas hardware (RAM atau media penyimpanan) memerlukan peningkatan untuk menjaga kelancaran operasional kerja harian."
            : "Kondisi perangkat dalam batas operasional wajar, disarankan pemeliharaan preventif secara teratur.",
        source: "RULE_ENGINE_SYSTEM",
        year: 2027
      }
    });
    const rec = await prisma.aiAssetRecommendation.create({
      data: {
        runId: aiRun.id,
        assetId: asset.id,
        score,
        scoreStatus: scoreStatus(score),
        recommendationTypes: recommendationTypes as any,
        priority: score >= 80 ? "kritis" : score >= 60 ? "tinggi" : score >= 30 ? "sedang" : "rendah",
        summary: `Hasil analisis AI untuk perangkat ${asset.assetName} menghasilkan indeks evaluasi risiko ${score} dari 100.`,
        recommendation: score >= 80 
          ? "Rekomendasi prioritas penggantian unit perangkat secara bertahap." 
          : score >= 60 
            ? "Lakukan peningkatan kapasitas memori (RAM) atau media penyimpanan (SSD) untuk memperpanjang siklus operasional." 
            : "Lanjutkan jadwal perawatan preventif berkala.",
        reason: score >= 80 
          ? "Perangkat mencapai batas depresiasi teknis dan memiliki riwayat kendala operasional yang mempengaruhi produktivitas kerja."
          : score >= 60 
            ? "Perangkat masih dapat beroperasi namun membutuhkan upgrade komponen penunjang."
            : "Perangkat dinilai masih dalam performa stabil.",
        nextYearPlan: score >= 80
          ? "Usulkan ke dalam rencana alokasi pengadaan perangkat pengganti periode berikutnya."
          : score >= 60
            ? "Alokasikan anggaran upgrade komponen pada pemeliharaan triwulanan."
            : "Pertahankan jadwal monitoring dan pembersihan rutin berkala.",
        openModelSucceeded: true,
        openModelErrorMessage: null
      }
    });
    await prisma.aiRecommendationDetail.createMany({
      data: [
        {
          aiAssetRecommendationId: rec.id,
          factor: "Siklus Usia dan Beban Kerja",
          scoreImpact: Math.min(score, 30),
          message: "Perangkat dievaluasi berdasarkan usia operasional dan beban kerja komputasi."
        },
        {
          aiAssetRecommendationId: rec.id,
          factor: "Riwayat Pemeliharaan",
          scoreImpact: Math.max(0, score - 50),
          message: "Frekuensi perbaikan dan biaya servis tercatat sebagai parameter risiko."
        }
      ]
    });
  }

  await prisma.auditLog.createMany({
    data: [
      {
        userId: admin.id,
        action: "INITIALIZE_DATABASE",
        module: "System",
        description: "Inisialisasi basis data awal sistem ASCIT dengan konfigurasi data contoh (dummy)."
      },
      {
        userId: admin.id,
        action: "CREATE_ASSET",
        module: "Data Aset IT",
        description: "Pemasukan 25 data aset contoh simulasi berhasil diproses."
      },
      {
        userId: admin.id,
        action: "AI_ANALYSIS",
        module: "AI & Rekomendasi",
        description: "Sistem memproses simulasi evaluasi kelayakan 10 perangkat contoh."
      }
    ]
  });

  console.log("ASCIT demo/dummy database seeding completed successfully.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
