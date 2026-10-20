# Bukti pengujian white box ASCIT

Tanggal pelaksanaan: 8 Oktober 2026 (Asia/Bangkok). Proyek: Next.js 15, TypeScript, npm (`package-lock.json`), Jest 29 dengan `ts-jest` dan lingkungan Node. Konfigurasi resmi: `jest.config.js`; perintah: `npm.cmd test -- --runInBand --no-cache` dan `npm.cmd run test:coverage -- --runInBand --no-cache --verbose --coverageDirectory=docs/bukti-pengujian-kp/coverage --coverageReporters=text --coverageReporters=json-summary`.

Pengujian hanya memanggil fungsi murni dan rate limiter di memori. Setup Jest memakai `NODE_ENV=test`, URL database dummy lokal, dan secret dummy; tidak ada koneksi database, migrasi, seeding, maupun penggunaan kredensial produksi. Perubahan source produksi tidak dilakukan.

## Hasil aktual

| Ukuran | Hasil |
|---|---:|
| Test suite | 3 lulus dari 3 |
| Test case PASS | 22 |
| Test case FAIL | 0 |
| Test case SKIPPED | 0 |
| Branch coverage seluruh source yang dikonfigurasi | 4,47% (103/2301) |
| Ambang branch coverage global resmi | 60%; **tidak tercapai** |

Perintah test biasa keluar dengan kode 0. Perintah coverage keluar dengan kode 1 karena empat ambang global (statement, branch, line, function) tidak tercapai, walaupun 22 test case tetap lulus. Coverage pada `scoring-engine.ts`: branch 56,69%; `error-handler.ts`: 49,05%; `rate-limit.ts`: 38,46%. Detail resmi ada di `jest-coverage-aktual.txt` dan `coverage/coverage-summary.json`. Angka coverage global mencakup banyak route dan modul tanpa test, sehingga tidak boleh dibaca sebagai coverage hanya pada tiga modul tersebut.

Log terminal: `jest-hasil-aktual.txt` dan `jest-coverage-aktual.txt`. Daftar semua test case dan lokasi source: `daftar-test-case.md`.

## Cakupan dan keterbatasan

Teruji secara otomatis: pemetaan error, akumulasi dan batas skor, garansi kosong/aktif/kedaluwarsa, tanggal pembelian tidak valid dalam rule engine, Intel i5-12400 yang tidak ditandai tua, ambang FAST/RECOMMENDED/FULL, dan pembatasan serta reset rate limiter di memori. Mode AI yang diuji hanya keputusan ambang `qualifiesForAi`, bukan eksekusi provider AI atau worker. Test tanggal pembelian menguji penanganan kualitas data oleh `scoreAsset`, bukan validasi input API. Autentikasi NextAuth dan validasi skema input pada route aset **BELUM DIUJI** secara otomatis. Klasifikasi Intel generasi lama yang positif, kedaluwarsa jendela rate limit, serta integrasi end-to-end juga **BELUM DIUJI**. Tidak ada klaim UAT.

## Materi BAB 5

### 5.2.1 Pengujian White Box

Pengujian white box dilakukan pada fungsi yang dapat dijalankan secara terisolasi menggunakan Jest dan `ts-jest` sesuai konfigurasi proyek. Tiga suite menguji penanganan kesalahan, perhitungan skor risiko pada rule engine, dan pembatasan permintaan di memori. Skenario rule engine mencakup akumulasi faktor risiko, pembatasan skor maksimum 100, status garansi, kualitas tanggal pembelian, pendeteksian prosesor Intel, serta ambang pemilihan mode AI. Pengujian dijalankan pada lingkungan testing tanpa akses ke database produksi. Hasil terminal dan laporan coverage disimpan sebagai bukti pada folder `docs/bukti-pengujian-kp/`.

**Tabel 5.9 Rekapitulasi Hasil Pengujian White Box ASCIT**

| No | Area Pengujian | Skenario | Hasil Aktual | Status | Bukti |
|---:|---|---|---|---|---|
| 1 | Error Handler | Pembuatan dan serialisasi error, factory HTTP, Prisma, Zod, dan error umum | 12 kasus sesuai ekspektasi | PASS | `error-handler.spec.ts`; `jest-coverage-aktual.txt` |
| 2 | Rule Engine | RAM 4 GB, HDD, garansi kedaluwarsa | Skor 45; status `PERLU_DIPANTAU` | PASS | `scoring-engine.spec.ts`; `jest-coverage-aktual.txt` |
| 3 | Batas skor | Faktor gabungan melebihi 100 | Skor akhir 100; prioritas kritis | PASS | `scoring-engine.spec.ts`; `jest-coverage-aktual.txt` |
| 4 | Garansi | Kosong, kedaluwarsa, aktif | Skor berturut-turut 0, 10, 0 | PASS | `scoring-engine.spec.ts`; `jest-coverage-aktual.txt` |
| 5 | Tanggal pembelian | String tanggal tidak valid pada rule engine | Peringatan kualitas data muncul | PASS | `scoring-engine.spec.ts`; `jest-coverage-aktual.txt` |
| 6 | Prosesor Intel | Intel Core i5-12400 | Tidak diberi faktor risiko prosesor lama | PASS | `scoring-engine.spec.ts`; `jest-coverage-aktual.txt` |
| 7 | Mode AI | FAST; RECOMMENDED pada 79/80; FULL pada 29/30 | Ambang sesuai ekspektasi test | PASS | `scoring-engine.spec.ts`; `jest-coverage-aktual.txt` |
| 8 | Rate Limiting | Batas permintaan dan reset bucket | Permintaan berlebih ditolak; bucket dapat dipakai kembali setelah reset | PASS | `rate-limit.spec.ts`; `jest-coverage-aktual.txt` |

### 5.2.3 Evaluasi Hasil Pengujian

Seluruh 22 test case pada tiga suite berhasil, tanpa kasus gagal atau dilewati. Hasil ini mendukung bahwa jalur fungsi yang diuji memberikan keluaran sesuai dengan ekspektasi pada data uji yang digunakan. Secara khusus, akumulasi faktor risiko menghasilkan skor 45, dan gabungan faktor yang melampaui 100 dibatasi menjadi 100. Hasil tersebut merupakan bukti pengujian unit terhadap implementasi, bukan bukti bahwa semua proses sistem telah tervalidasi secara menyeluruh.

Pemeriksaan coverage memperlihatkan branch coverage global sebesar 4,47%, di bawah ambang 60% pada konfigurasi proyek. Karena itu, perintah coverage berakhir dengan status gagal meskipun semua test case lulus. Banyak modul, termasuk autentikasi, validasi input route aset, dan alur AI lengkap, belum memiliki bukti pengujian otomatis pada pelaksanaan ini. Pengujian lanjutan diperlukan sebelum membuat kesimpulan mengenai perilaku sistem secara keseluruhan.
