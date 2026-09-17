# ASCIT (Asset Care Information Technology System)
### RS Awal Bros Panam Pekanbaru

[![Repository](https://img.shields.io/badge/GitHub-mhmdhabibrafi%2FASCIT-181717?style=flat&logo=github)](https://github.com/mhmdhabibrafi/ASCIT)
[![Proprietary](https://img.shields.io/badge/License-Proprietary%20All%20Rights%20Reserved-red)](./LICENSE)
[![Framework](https://img.shields.io/badge/Next.js-15.5-black?logo=next.js)](https://nextjs.org/)
[![Database](https://img.shields.io/badge/PostgreSQL-17-blue?logo=postgresql)](https://www.postgresql.org/)

> **Sistem Informasi Manajemen & Pemeliharaan Aset Teknologi Informasi**  
> Dikembangkan khusus untuk tata kelola inventaris, pemeliharaan berkala, mutasi, monitoring jaringan/IP, dan analisis siklus pakai aset IT di lingkungan **RS Awal Bros Panam Pekanbaru**.

* **Repository Resmi**: [https://github.com/mhmdhabibrafi/ASCIT](https://github.com/mhmdhabibrafi/ASCIT)

---

## 👥 Tim & Struktur Pengembang

Sistem ini dirancang, dibangun, dan dikelola oleh:

* **Programmer / Software Engineer**: **Muhammad Habib Rafi** ([@mhmdhabibrafi](https://github.com/mhmdhabibrafi))
* **Kepala Departemen IT**: **Arpi Nanda Putra, S.Kom.**
* **Unit Kerja**: **Departemen Teknologi Informasi (IT) — RS Awal Bros Panam Pekanbaru**

---

## 📋 Fitur Utama Sistem

1. **Dashboard Operasional Eksekutif & Real-time**
   - Ringkasan total aset, status kondisi (Baik, Rusak Ringan, Rusak Berat), dan distribusi kategori.
   - Grafik riwayat mutasi, service record bulanan, dan beban kerja pemeliharaan.
   - Shortcut aksi cepat untuk penambahan aset, input servis, dan pelaporan insiden.

2. **Manajemen Data Aset IT & Vendor**
   - Pencatatan spesifikasi detail aset rumah sakit (PC, Laptop, Server, Switch, Printer, UPS, CCTV, dll.).
   - Inventarisasi aset pihak ketiga / sewa (Vendor Assets).
   - Penomoran kode unik otomatis & pencetakan label **QR Code** untuk penempelan fisik pada perangkat.

3. **Pelacakan Mutasi & Pergerakan Aset**
   - Riwayat perpindahan unit kerja, ruangan, dan penanggung jawab aset secara runut (*traceable*).
   - Validasi approval mutasi dan berita acara serah terima aset digital.

4. **Service Records & Maintenance History**
   - Dokumentasi riwayat perawatan preventif dan perbaikan korektif.
   - Pencatatan suku cadang pengganti (*spare parts*), estimasi biaya, teknisi internal, dan vendor eksternal.
   - Rekam jejak waktu henti (*downtime*) dan status penyelesaian servis.

5. **Monitoring Siklus Pakai & AI Decision Support**
   - Estimasi depresiasi dan umur ekonomis perangkat IT.
   - Rekomendasi otomatis berbasis analisis beban servis untuk peremajaan (*replacement*) atau perawatan intensif.

6. **Monitoring IP Address & Alokasi Jaringan**
   - Pemetaan pembagian IP static/DHCP pada unit dan perangkat jaringan.
   - Pencegahan tabrakan IP (*duplicate IP check*) dan audit ketersediaan pool subnet rumah sakit.

7. **Sistem Pemindaian QR Code (Scan QR)**
   - Integrasi kamera smartphone / scanner USB langsung dari aplikasi web.
   - Inspeksi cepat detail aset dan riwayat perbaikan hanya dengan memindai stiker QR pada fisik perangkat.

8. **Keamanan, RBAC & Audit Log**
   - Otentikasi aman berbasis sesi via NextAuth.js.
   - *Role-Based Access Control* (Super Admin, IT Admin, Teknisi, Staf Unit).
   - Pencatatan aktivitas sensitif pengguna ke dalam *Audit Trail* yang tidak dapat dimanipulasi.

---

## 💻 Tech Stack

* **Framework**: [Next.js 15](https://nextjs.org/) (App Router, Turbopack Engine)
* **Frontend Library**: [React 19](https://react.dev/) & [TypeScript](https://www.typescriptlang.org/)
* **Styling**: [Tailwind CSS](https://tailwindcss.com/) & Vanilla CSS Design System
* **Database & ORM**: [PostgreSQL](https://www.postgresql.org/) & [Prisma ORM v6](https://www.prisma.io/)
* **Authentication**: [NextAuth.js v4](https://next-auth.js.org/)
* **Icons & Typography**: Google Fonts (Inter, Material Symbols Rounded) & Lucide React
* **Data Processing**: ExcelJS (Laporan Spreadsheet) & QRCode Generator

---

## 📁 Struktur Direktori Proyek

```
ascit/
├── backups/                    # Arsip database & backup data
├── prisma/
│   ├── schema.prisma           # Skema database relasional Prisma
│   └── migrations/             # Riwayat migrasi database
├── public/
│   └── images/                 # Logo RS Awal Bros & aset gambar publik
├── scripts/
│   ├── local.mjs               # Controller runner aplikasi & database lokal
│   ├── local-config.mjs        # Konfigurasi embedded PostgreSQL lokal
│   └── ai-worker.ts            # Background worker pendukung sistem
├── src/
│   ├── app/                    # Next.js App Router (Rute halaman & API)
│   │   ├── (auth)/login/       # Halaman autentikasi login
│   │   ├── dashboard/          # Dashboard operasional
│   │   ├── assets/             # Manajemen data aset IT
│   │   ├── vendor-assets/      # Manajemen aset vendor
│   │   ├── mutations/          # Modul mutasi & transfer aset
│   │   ├── service-records/    # Riwayat servis & pemeliharaan
│   │   ├── monitoring/         # Monitoring IP address & jaringan
│   │   ├── recommendations/    # AI Decision support & analitik
│   │   ├── master-data/        # Referensi unit, ruangan, vendor, kategori
│   │   ├── users/              # Manajemen pengguna & role
│   │   ├── audit-log/          # Catatan log aktivitas pengguna
│   │   └── settings/           # Pengaturan konfigurasi & runtime
│   ├── components/             # Reusable UI & Layout Components
│   └── lib/                    # Helper logika, auth, branding, permissions
├── docker-compose.yml          # Konfigurasi deployment container Docker
├── Dockerfile                  # Multi-stage production container build
├── INSTALL-DOCKER-UBUNTU.md     # Panduan instalasi Ubuntu Server
└── package.json
```

---

## 🚀 Panduan Menjalankan Sistem

### 1. Menjalankan di Komputer Lokal (Tanpa Docker)

ASCIT dilengkapi dengan script otomasi `local.mjs` yang dapat mengelola database PostgreSQL lokal bawaan secara mandiri:

1. **Install Dependensi**:
   ```bash
   npm install
   ```

2. **Siapkan File Konfigurasi Lingkungan (`.env`)**:
   Salin dari template:
   ```bash
   cp .env.example .env
   ```
   Pastikan variabel `DATABASE_URL` dan `NEXTAUTH_SECRET` telah terisi.

3. **Setup Database & Jalankan Migrasi**:
   ```bash
   npm run db:setup
   ```

4. **Mulai Server Pengembangan (Dev Server)**:
   ```bash
   npm run dev
   ```
   Aplikasi akan aktif di `http://localhost:3000`.

---

### 2. Menjalankan di Server Produksi (Docker & Ubuntu)

Untuk penerapan pada server VPS atau server fisik Ubuntu di RS Awal Bros Panam:

1. Baca panduan lengkap instalasi Docker pada [INSTALL-DOCKER-UBUNTU.md](./INSTALL-DOCKER-UBUNTU.md).
2. Jalankan container dengan Docker Compose:
   ```bash
   docker compose up -d --build
   ```
3. Pantau status container:
   ```bash
   docker compose ps
   docker compose logs -f app
   ```

---

## 🔑 Hak Akses & Akun Demo (Data Sintetis / Dummy)

Saat database di-*seed* menggunakan script seeding bawaan (`prisma/seed.ts`), sistem membuat akun dummy untuk pengujian lokal:

| Role | Username / Email | Password Default (Demo) | Catatan |
| :--- | :--- | :--- | :--- |
| **Admin IT** | `admin` / `admin@ascit.local` | `DemoPassword123` | Akses penuh operasional IT |
| **Staff IT** | `staf` / `staf@ascit.local` | `DemoPassword123` | Teknisi perbaikan & mutasi |
| **Kepala IT** | `kepala` / `kepala@ascit.local` | `DemoPassword123` | Approval & evaluasi siklus |
| **Manajemen**| `manajemen` / `manajemen@ascit.local` | `DemoPassword123` | Monitoring & laporan eksekutif |

> **PERHATIAN KEAMANAN**: 
> Seluruh data bawaan repository (perangkat, serial number, alamat IP `10.99.x.x`, dan akun di atas) adalah **100% data dummy sintetis** semata. Untuk penggunaan produksi rumah sakit, jangan gunakan password demo dan definisikan kredensial yang kuat melalui file `.env`.

---

## 📞 Kontak & Dukungan Teknis

Untuk pertanyaan teknis, kendala bug, atau permohonan fitur baru:
* **Departemen IT RS Awal Bros Panam Pekanbaru**
* **Penanggung Jawab**: Arpi Nanda Putra, S.Kom. (Kepala Departemen IT)
* **Pengembang**: Muhammad Habib Rafi (Programmer)

---
*Copyright © 2026 RS Awal Bros Panam Pekanbaru. All rights reserved.*
