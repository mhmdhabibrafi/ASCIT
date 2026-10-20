# Pembaruan ASCIT melalui web (Windows)

ASCIT tetap website LAN. Hanya server membutuhkan koneksi keluar HTTPS ke GitHub
dan registry npm. Tidak perlu membuka port dari internet. Updater mengikat
127.0.0.1:4319; jangan proxy atau expose port ini ke LAN.

## Setup sekali di server

1. Gunakan Node.js 24, Windows PowerShell 5.1, serta PostgreSQL aktif.
   Untuk database embedded, pertahankan folder instalasi pertama beserta `.local/postgres`.
2. Pasang PostgreSQL client tools sesuai versi server. Atur `PG_DUMP_PATH` di `.env`
   ke path absolut `pg_dump.exe`. Updater menolak pemasangan jika backup belum siap.
3. Pastikan `DATABASE_URL`, `NEXTAUTH_SECRET`, `LOCAL_NEXTAUTH_URL` (alamat LAN)
   dan konfigurasi aplikasi sudah benar. Build awal: `npm.cmd ci`, `npm.cmd run build`.
4. Jalankan `node scripts/updater/setup.mjs` dari root ASCIT.
   `.local/updater/config.json` menyimpan konfigurasi server, termasuk kredensial;
   batasi ACL folder ini ke akun layanan dan administrator. Jangan commit atau membagikannya.
5. Hentikan launcher web lama (bukan database), lalu uji:
   `node .local/updater/engine/worker.mjs .local/updater`
6. Untuk mulai otomatis setelah reboot, jalankan PowerShell sebagai administrator:
   `.\scripts\updater\register-task.ps1`.
   Masukkan akun Windows layanan lokal yang memiliki akses folder aplikasi, updater,
   dan database. Hentikan worker manual, lalu
   `Start-ScheduledTask -TaskName 'ASCIT Updater'`.
7. Login Admin IT → Pengaturan → Pembaruan Sistem → Periksa Pembaruan.

Jika repository menjadi private, set `ASCIT_GITHUB_TOKEN` sebelum setup, atau isi
`githubToken` pada config server dan restart task. Gunakan token Contents:read
untuk repository ASCIT saja. Token tidak dikirim ke browser.

## Menerbitkan update

- Commit perubahan yang sudah diuji, termasuk workflow dan file updater.
- Naikkan `package.json` dan lockfile ke versi stabil baru.
- Push commit dan tag `vX.Y.Z`, lalu publish GitHub Release dengan catatan perubahan.
- Workflow `windows-update-release.yml` menguji build Windows dan melampirkan
  `ascit-windows-source.zip`. Tombol pemasangan baru aktif jika paket memiliki
  digest SHA-256 GitHub. Jangan menaruh `.env`, database atau unggahan di Git.
- Admin lokal memeriksa rilis, membaca catatan lalu mengonfirmasi Update.

## Perilaku dan batas versi pertama

- Hanya administrator dengan izin `system:admin`; POST harus same-origin.
- Update diserialkan; paket diverifikasi SHA-256, ukuran dan path ZIP sebelum diekstrak.
- Setiap versi disiapkan di folder baru; `npm ci`, generate Prisma dan build dilakukan
  sebelum menghentikan web aktif. Seed tidak pernah dijalankan.
- Semua isi folder `prisma` harus identik dengan versi aktif. Rilis dengan perubahan
  schema/migrasi memerlukan maintenance manual; updater tidak mengklaim bisa rollback schema.
- Backup `pg_dump -Fc` wajib berhasil sebelum pergantian versi. Tidak ada fallback JSON.
- `public/uploads` dibagikan melalui junction ke instalasi awal. `.env` tidak ditimpa;
  konfigurasi aplikasi disimpan di config updater. Restart task setelah mengubah config.
- Health check menguji database dan web. Jika versi baru gagal, kode versi sebelumnya
  diaktifkan kembali. Database tidak direstore otomatis sehingga data baru tidak dihapus.
- Tidak zero-downtime: pergantian membutuhkan jeda singkat. Simpan pekerjaan sebelum update.
- Jika Windows mati saat pergantian, supervisor memulihkan pointer versi sebelumnya
  saat restart. Backup dan versi lama tidak dihapus otomatis.
- Engine updater sendiri tetap di `.local/updater/engine`; upgrade engine dilakukan oleh
  administrator, bukan menimpa proses updater yang sedang berjalan.
- Log lokal: `.local/updater/worker.log`; status: `state.json`; backup: `backups/*.dump`.
  Folder rilis dapat besar karena menyimpan dependensi. Pantau kapasitas disk.
- Worker ini tidak mengelola worker AI terpisah. Jika memakai worker AI, hentikan dan
  perbarui worker tersebut dalam maintenance terencana bersama versi web.

## Pemulihan manual

Hentikan scheduled task. Periksa `state.json` dan `worker.log`. Pertahankan semua
folder versi dan backup. Untuk kembali ke kode lama, pilih `current` dan `version`
versi lama di state, lalu mulai task. Jangan restore database saat pengguna masih
menulis data. Pemulihan dump dilakukan administrator PostgreSQL dalam maintenance.

Pengujian lokal menggunakan fixture terisolasi; tidak menerbitkan rilis GitHub
atau mengganti database operasional. Uji upgrade antarrilis pada server staging
dengan salinan database sebelum penggunaan pertama di server kantor.

Pengujian otomatis:

- `npm.cmd run updater:test`: versi, checksum, pemulihan, dan ekstraksi ZIP.
- `npm.cmd test -- --runInBand src/__tests__/updates.spec.ts`: otorisasi dan origin API.
- `node --test scripts/updater/worker.test.mjs`: integrasi Windows dengan paket,
  web, GitHub, dan program backup fixture. Memakai port 4319 dan 3198;
  jalankan di lingkungan pengujian saat updater asli tidak berjalan.

## Validasi perbaikan 21 Oktober 2026

- Build produksi berhasil. Peringatan lint variabel tidak terpakai pada modul lain masih ada.
- Tujuh pengujian engine/ekstraksi/integrasi Windows dan lima pengujian API lulus.
  Integrasi juga memeriksa waktu pemeriksaan rilis dan menolak pemasangan saat
  berkas perangkat pencadangan tidak ditemukan.
- Browser produksi: pemeriksaan GitHub berhasil, versi terpasang dan terbaru 1.0.0,
  waktu pemeriksaan tersimpan, perangkat backup tersedia, Markdown rilis terformat.
- Simulasi browser: pesan kesalahan bertahan setelah polling, konten rilis tidak
  mengeksekusi HTML atau tautan JavaScript, pembatalan tidak memasang pembaruan,
  konfirmasi mengirim satu permintaan, dan tahap persiapan ditampilkan sesuai status.
- Tampilan desktop dan ponsel diperiksa; tidak ada overflow horizontal pada lebar 390 px.
- Layanan produksi kembali aktif dengan health check `healthy`. Tidak ada reseeding
  atau pemasangan paket fixture ke database operasional.
- Pemasangan rilis nyata dari GitHub belum diuji pada tahap ini. Rilis 1.0.0 belum
  menyediakan paket Windows yang diperlukan. Pengujian pemulihan memakai fixture,
  bukan bukti bahwa semua modul aplikasi bebas bug.
