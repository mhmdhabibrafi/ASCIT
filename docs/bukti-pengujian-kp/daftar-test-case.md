# Daftar test case dan lokasi source

Seluruh hasil aktual di bawah berasal dari keluaran Jest verbose pada `jest-coverage-aktual.txt`; status masing-masing **PASS**. Nomor baris pada source adalah lokasi fungsi, sedangkan nomor baris test dapat dilihat langsung dalam file spesifikasi.

| No | Fungsi/source | File test | Skenario dan hasil yang diharapkan | Hasil aktual |
|---:|---|---|---|---|
| 1 | `ApiError`, `src/lib/error-handler.ts` | `error-handler.spec.ts` | Properti error sesuai input | Sesuai; PASS |
| 2 | `ApiError.toJSON`, `src/lib/error-handler.ts` | `error-handler.spec.ts` | Serialisasi kode, status, detail, waktu | Sesuai; PASS |
| 3 | `ApiErrors.badRequest`, `src/lib/error-handler.ts` | `error-handler.spec.ts` | HTTP 400 | Sesuai; PASS |
| 4 | `ApiErrors.unauthorized`, `src/lib/error-handler.ts` | `error-handler.spec.ts` | HTTP 401 | Sesuai; PASS |
| 5 | `ApiErrors.notFound`, `src/lib/error-handler.ts` | `error-handler.spec.ts` | HTTP 404 dan pesan aset | Sesuai; PASS |
| 6 | `ApiErrors.conflict`, `src/lib/error-handler.ts` | `error-handler.spec.ts` | HTTP 409 dan detail | Sesuai; PASS |
| 7 | `ApiErrors.validationError`, `src/lib/error-handler.ts` | `error-handler.spec.ts` | HTTP 422 dan daftar kesalahan | Sesuai; PASS |
| 8 | `handleApiError`, `src/lib/error-handler.ts:100` | `error-handler.spec.ts` | Error khusus mempertahankan kode dan request ID | Sesuai; PASS |
| 9 | `handleApiError`, `src/lib/error-handler.ts:100` | `error-handler.spec.ts` | Prisma P2025 menjadi 404 | Sesuai; PASS |
| 10 | `handleApiError`, `src/lib/error-handler.ts:100` | `error-handler.spec.ts` | Prisma P2002 menjadi 409 | Sesuai; PASS |
| 11 | `handleApiError`, `src/lib/error-handler.ts:100` | `error-handler.spec.ts` | Zod error menjadi 422 beserta detail | Sesuai; PASS |
| 12 | `handleApiError`, `src/lib/error-handler.ts:100` | `error-handler.spec.ts` | Error umum menjadi 500 | Sesuai; PASS |
| 13 | `scoreAsset`, `src/lib/ai/scoring-engine.ts:128` | `scoring-engine.spec.ts` | RAM 20 + HDD 15 + garansi 10 = 45; perlu dipantau | Skor 45 dan status sesuai; PASS |
| 14 | `scoreAsset`, `src/lib/ai/scoring-engine.ts:128` | `scoring-engine.spec.ts` | Jumlah faktor >100 dibatasi menjadi 100 | Skor 100, prioritas kritis; PASS |
| 15 | `scoreAsset`, `src/lib/ai/scoring-engine.ts:128` | `scoring-engine.spec.ts` | Garansi kosong tidak menambah skor; ada peringatan | Skor 0 dan peringatan; PASS |
| 16 | `scoreAsset`, `warrantyState`, `src/lib/ai/scoring-engine.ts:103` | `scoring-engine.spec.ts` | Garansi kedaluwarsa menambah 10 | Skor 10; PASS |
| 17 | `scoreAsset`, `warrantyState`, `src/lib/ai/scoring-engine.ts:103` | `scoring-engine.spec.ts` | Garansi aktif tidak menambah skor | Skor 0; PASS |
| 18 | `scoreAsset`, `src/lib/ai/scoring-engine.ts:128` | `scoring-engine.spec.ts` | Intel i5-12400 tidak ditandai lama | Faktor Processor tidak muncul; PASS |
| 19 | `qualifiesForAi`, `src/lib/ai/scoring-engine.ts:47` | `scoring-engine.spec.ts` | FAST false; RECOMMENDED 79 false/80 true; FULL 29 false/30 true | Semua sesuai; PASS |
| 20 | `scoreAsset`, `src/lib/ai/scoring-engine.ts:128` | `scoring-engine.spec.ts` | Tanggal pembelian invalid menghasilkan peringatan | Peringatan muncul; PASS |
| 21 | `checkRateLimit`, `src/lib/rate-limit.ts:6` | `rate-limit.spec.ts` | Dua permintaan diizinkan, ketiga ditolak | Ditolak dengan retryAfterSeconds positif; PASS |
| 22 | `clearRateLimit`, `src/lib/rate-limit.ts:31` | `rate-limit.spec.ts` | Bucket penuh dapat direset | Permintaan baru diizinkan; PASS |

Path lengkap file test berada di `src/__tests__/`. Beberapa ekspektasi dalam satu test case dihitung sebagai satu kasus, sesuai keluaran Jest.
