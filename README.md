# RAISE

Frontend HSE dengan dua dashboard: **perusahaan** untuk hasil keseluruhan dan antrean review, serta **pegawai** untuk daftar pegawai, rekap periodik, tren kumulatif, dan riwayat. Camera hub menampilkan sumber bersama dan arsip rekaman.

Alur terbaru mengikuti klarifikasi pengguna di [FLOW.md](./FLOW.md). Perilaku ini menggantikan alur tombol mulai analisis dan asumsi pegawai tetap per kamera pada rancangan sebelumnya. Identitas dan hasil tidak diasumsikan dari kamera.

## Menjalankan

Node.js 20.19+ dan npm:

```sh
cd frontend
npm install
npm run dev
```

Buka `http://localhost:3000/`. Tanpa backend, frontend menampilkan **Data demo** dengan delapan pegawai dan fixture yang jelas berlabel. Pilih **Gunakan data layanan** untuk mode layanan. Contoh harian lengkap dapat dibuka melalui `#/employees/EMP-8021?period=day&demo=1`. Tidak ada timer yang menciptakan hasil inferensi baru.

Dari folder `frontend`, `npm run build` menghasilkan `frontend/dist/`. `npm run preview` menyajikan build produksi. `npm test` menjalankan pengujian kontrak, kalkulasi, pembaruan berkala, rekap, label manual, penyimpanan video, dan interaksi UI.

## Alur yang tersedia

| Route | Fungsi |
| --- | --- |
| `#/overview` | Dashboard perusahaan: pegawai teramati, pegawai perlu review, risiko tinggi periode, waktu usable, tren kumulatif, dan antrean review |
| `#/employees` | Daftar pegawai dengan pencarian, departemen, filter review, serta periode |
| `#/employees?review=needed` | Pegawai yang memiliki temuan untuk ditinjau |
| `#/employees/:id` | Detail pegawai: rekap harian/mingguan, tanggal historis, tren kumulatif, riwayat rekaman, dan review HSE |
| `#/cameras` | Camera hub tanpa pemilik pegawai tetap |
| `#/cameras/:id` | Sumber live jika tersedia; status layanan dan rekaman terkait |
| `#/cameras/archive` | Arsip lintas hari, pencarian, kamera, dan tanggal |
| `#/recordings/:id` | Pemutar rekaman tersimpan dan label manual untuk satu atau beberapa pegawai |
| `#/report/:id` | Laporan asesmen backend dan worksheet/review versi, untuk integrasi layanan |

Route lama `#/analyze/:id`, `#/processing`, dan `#/history` diarahkan ke layar yang sesuai dengan alur baru. Tidak ada tombol pengguna untuk memulai inferensi.

## Analisis otomatis dan data kumulatif

Pipeline berjalan di layanan sumber kamera sejak kamera menyala, terlepas dari apakah dashboard terbuka. Frontend mengambil data setiap **60 detik**, serta saat tab kembali terlihat. Membuka detail kamera atau pegawai hanya membaca data.

Hasil AI langsung masuk ke rekap. Status dan kebutuhan review HSE ditampilkan terpisah; hasil tidak menunggu approval agar terlihat. Penghitungan menggunakan ID interval dan revisi yang stabil: pembaruan mengganti data yang sama, bukan menambahnya lagi. Poin dan waktu diakumulasi; skor REBA ditampilkan sebagai nilai tertinggi pada periode, bukan dijumlahkan.

Detail pegawai berisi hasil periodik; tidak ada panel postur/kondisi live pegawai. Review membekukan snapshot saat dialog dibuka. Bila hasil/revisi yang ditampilkan berubah, penyimpanan diblokir sampai tinjauan dibuka ulang. Catatan dan keputusan HSE disimpan lokal dengan scope pegawai, periode, snapshotId, revision, dan sumber data.

## Rekaman dan label manual

Camera hub menyertakan **16 catatan arsip: 12 historis dan 4 pada hari berjalan**. Catatan ini berlabel **Contoh metadata**. Tidak ada file footage asli dalam repository; catatan belum dapat diputar sampai Anda menautkan video. Ilustrasi tidak diklaim sebagai rekaman.

Gunakan **Tambahkan rekaman** atau **Tautkan file rekaman** untuk menyimpan video yang sebenarnya. Tanpa backend, file tersimpan di **IndexedDB** dan metadata/label di **localStorage** perangkat ini. File bisa dibuka kembali setelah refresh. Penyimpanan browser bukan penyimpanan terpusat; menghapus data situs menghapus arsip lokal. Mengganti file mengosongkan label sebelumnya agar identitas perlu dikonfirmasi ulang.

Satu video dapat memiliki beberapa label: ID/nama pegawai, penanda subjek yang terlihat, serta interval kemunculan. Rentang tidak valid, penanda subjek duplikat, dan interval bertumpang tindih untuk pegawai yang sama ditolak. Menyimpan label tidak mengubah pemilik kamera. Satu pegawai dapat muncul pada beberapa kamera/rekaman.

## Integrasi backend

Salin `frontend/.env.example` ke `frontend/.env.local`, isi `VITE_API_BASE_URL`, lalu restart Vite. Backend harus mengizinkan origin frontend melalui CORS. Variabel `VITE_` tersedia di bundle browser; jangan menaruh secret di dalamnya.

[API_CONTRACT.md](./API_CONTRACT.md) mendokumentasikan sumber live, pegawai, interval observasi, rekaman, label, dan review. Adapter alur baru berada di `frontend/src/lib/workspace-api.ts`; kontrak asesmen versi sebelumnya tetap di `frontend/src/lib/api.ts` untuk layar laporan.

Sumber live harus memberikan URL video yang kompatibel dengan browser. Frontend tidak mengakses kamera fisik atau memulai perekaman kontinu sendiri. Model, stream, penyimpanan rekaman terpusat, dan pipeline inferensi masih memerlukan layanan backend yang sebenarnya.

## Metode dan provenance

Metode mengikuti PRD: REBA untuk severity, ISO 11226-inspired untuk durasi/hold, dan poin RAISE eksperimental untuk paparan kumulatif. Skor 11–15 mempertahankan label tindakan segera. Sembilan jam shift asumsi 08:00–17:00 Asia/Jakarta tidak diperlakukan sebagai sembilan jam observasi.

Fixture hasil contoh terpisah dari data layanan. Review contoh dapat disimpan sebagai state frontend lokal, dengan penanda lokal dan scope snapshot; review ini tidak dikirim sebagai approval backend. Hasil contoh juga tidak ditautkan ke video sebenarnya yang menggantikan catatan arsip. Penentuan interval eligible lintas kamera, aturan overlap, kelengkapan worksheet, serta validasi perhitungan tetap menjadi tanggung jawab layanan; frontend tidak menebak hubungan orang antar kamera.

## Desain dan verifikasi

React, TypeScript, Vite, Poppins lokal dengan fallback Inter. Tema mengikuti `design.md` revisi 2.0: canvas #F3F3F3, biru baja #47769E, navy #243F57, highlight #9BBEDC, header gradien, judul tebal, kontrol minimum 44 px, dan badge semantik. Nama aplikasi berasal dari `frontend/src/lib/brand.ts`. Theme utama berada di `frontend/src/raise-theme.css`; gaya layout sebelumnya berada dalam cascade layer `legacy`. Referensi Figcraft lama tidak mengalahkan token desain terbaru.

Build produksi dan **61 pengujian** lulus. Uji meliputi fixture MSD/noise yang konsisten, dosis personal versus area, scope hari/minggu, modal bukti tanpa file, revisi snapshot, catatan HSE yang bertahan setelah refresh, penyimpanan video, dan migrasi metadata saat rename. Browser tidak terhubung di lingkungan eksekusi, sehingga pemeriksaan screenshot dan decoding footage nyata belum terverifikasi.

## Asesmen pegawai dan review lokal

Detail pegawai berisi header identitas/periode/shift/lokasi/waktu hasil, coverage, kartu MSD dan kebisingan, grafik periodik, intervensi dengan alasan/prioritas, bukti multi-kamera, dan tinjauan HSE. Harian/Mingguan memperbarui seluruh scope. Field yang belum tersedia dijelaskan secara eksplisit; metadata bukti tanpa file memakai status **Rekaman belum tersedia**.

Fixture harian EMP-8021: rekaman 40 menit, valid 30 menit, Medium REBA 5, paparan 12 menit (40%), holding terlama 45 detik, 14 episode, 28 poin prototipe, dan 56 poin/jam valid. Pembacaan personal Simulasi 88 dBA selama 40 menit memberi kontribusi 16,7% menurut profil contoh 85/3. Status kebisingan berasal dari fixture, terpisah dari band REBA. Dosis lintas hari tidak dijumlahkan menjadi dosis mingguan.

Aksi **Tandai perlu bukti** dan **Simpan review** memakai localStorage. Review baru berstatus **Belum direview**; review pada pegawai/periode/revisi lain tidak ikut diterapkan. Revisi baru mempertahankan catatan lama dan meminta peninjauan kembali. Warna risiko hanya mengklasifikasikan MSD; status kebisingan tetap mengikuti pembacaan mock.

### Dashboard URLs

Dashboard pages use `/overview`, `/employees`, `/cameras`, and `/recordings/:id` without a hash. Old `/#/...` links are migrated automatically. Production hosting must serve `frontend/dist/index.html` for unmatched page routes (SPA fallback); API routes must remain separate. Vite dev and preview support this fallback. `VITE_API_BASE_URL` can include a version prefix such as `http://localhost:8000/api/v1` when the backend serves that prefix.
