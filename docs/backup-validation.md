# Hasil pemeriksaan backup — 21 Oktober 2026

Perbaikan:

- Client PostgreSQL 17.11 tersedia di `.local/tools/postgresql-17.11`.
- `PG_DUMP_PATH` dan `PSQL_PATH` dikonfigurasi lokal; kredensial database tidak diubah.
- Parameter URL khusus Prisma (`schema`) tidak diteruskan ke client PostgreSQL.
- Unduhan memakai pemeriksaan HTTP dan pesan kegagalan; respons error tidak diunduh sebagai backup.
- Halaman menampilkan kesiapan SQL dan status restore yang sebenarnya.
- Keterangan JSON diperbaiki: bukan backup penuh, tanpa password, maksimal 500 audit log terbaru.
- Restore SQL memakai transaksi tunggal dan berhenti pada error.

Hasil aktual:

| Pemeriksaan | Hasil |
| --- | --- |
| Build production | LULUS |
| Unit test client PostgreSQL | 3 pengujian LULUS |
| Unduh SQL melalui tombol browser | LULUS, file berisi DDL dan INSERT |
| Unduh JSON melalui tombol browser | LULUS, 57 aset, tanpa password akun |
| Simulasi HTTP 500 | Pesan error tampil; tidak menghasilkan unduhan |
| Restore file SQL hasil unduhan | LULUS pada cluster uji terpisah, port 5549 |
| Jumlah tabel hasil restore | 24; jumlah baris sesuai isi file SQL |
| Aset / akun hasil restore | 57 / 4 |
| Database sumber selama uji restore | Jumlah baris seluruh tabel sebelum dan sesudah sama |
| Backup format custom updater | Berhasil dibuat dan dibaca dengan `pg_restore --list` |
| Tampilan halaman | Screenshot hasil baru diperiksa |

Percobaan browser gabungan sempat timeout; unduhan SQL dan JSON kemudian diverifikasi
melalui pengujian terpisah. Tidak dianggap lulus hanya berdasarkan build.

Restore melalui web tetap dinonaktifkan sesuai konfigurasi server. Restore dan
hapus database operasional tidak dijalankan. Uji restore menggunakan cluster
terpisah yang dihentikan sesudah verifikasi. Backup, file database uji, dan
screenshot berada di `.local/backup-validation`, di luar Git; file SQL memuat data
akun lengkap sehingga tidak disertakan dalam dokumentasi.
