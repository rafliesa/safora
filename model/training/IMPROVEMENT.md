# Eksperimen perbaikan, 7 November 2026

Targetnya skor yang berubah saat video berjalan. Model terpilih memakai fitur frame saat ini; tidak membutuhkan batas aktivitas, akhir klip, atau frame masa depan. Output mencakup empat komponen MURI dengan kelas 1, 2, dan 3.

## Perubahan yang dipakai

Detektor sendi diperbesar dari YOLO11s Pose pada input 640 menjadi YOLO11x Pose pada 960. Sampel, timestamp, pekerja, dan label tetap sama; fallback ke pose lama menjaga cakupan 4.023 frame. Tekukan pinggang dan lengan memakai fitur geometri tubuh. Rotasi pinggang memakai fitur fisik sederhana dengan regresi logistik. Lutut mempertahankan Random Forest karena kandidat lain tidak membantu.

Model skor dilatih ulang. Bobot detektor YOLO tetap pretrained. Eksperimen tambahan melatih MobileNetV3-small selama 15 epoch tetap pada crop pekerja dan fitur pose; model tersebut tidak dipakai dalam hasil akhir.

## Perbandingan

Macro-F1 berikut dihitung dari prediksi gabungan saat setiap pekerja bergantian menjadi data validasi.

| Kandidat tetap | Pinggang | Rotasi | Lengan | Lutut |
|---|---:|---:|---:|---:|
| Baseline YOLO11s + Random Forest | 0,331 | 0,549 | 0,402 | 0,323 |
| YOLO11x + Random Forest | 0,329 | 0,548 | 0,452 | 0,323 |
| YOLO11x + geometri | 0,334 | 0,547 | 0,517 | 0,320 |
| YOLO11x + fitur fisik linear | 0,311 | 0,617 | 0,496 | 0,289 |
| MobileNetV3 + pose YOLO11s | 0,345 | 0,589 | 0,461 | 0,319 |
| Gabungan terpilih dari kandidat YOLO11x | 0,334 | 0,617 | 0,517 | 0,323 |

Gabungan akhir memilih kandidat terbaik per komponen dari eksperimen geometri, temporal, dan fisik dengan YOLO11x. Nilai tersebut **dipakai untuk memilih model**, sehingga merupakan validasi pengembangan dan belum merupakan estimasi independen untuk pekerja baru. Model MobileNet tidak termasuk ruang pemilihan gabungan ini.

Sebagai pemeriksaan yang lebih konservatif, pemilihan kandidat fisik menggunakan validasi bertingkat: pekerja yang diuji tidak dipakai untuk memilih kandidat pada fold tersebut. Hasilnya 0,329 / 0,569 / 0,486 / 0,323. Ini mendukung adanya perbaikan lengan, tetapi tidak membuktikan angka gabungan akhir akan tercapai di luar dataset. Jumlah pekerja hanya tiga; keputusan eksperimen secara keseluruhan tetap dipengaruhi hasil dataset ini.

Eksperimen fitur temporal empat detik dan fitur visual DINOv2 tidak memberi peningkatan yang konsisten. Hasil agregasi seluruh aktivitas tidak dipakai untuk klaim skor real-time karena membutuhkan informasi seluruh interval. Laporan setiap eksperimen disertakan dalam `experiments` pada paket hasil.

## Pemeriksaan hasil

- Lima belas unit test lulus, mencakup parser waktu, ROI pekerja, transformasi fitur, konteks temporal kausal, crop, normalisasi, dan perlindungan video input.
- Identitas pekerja, timestamp, interval, dan label cache pose baru sama persis dengan baseline.
- Prediksi semua 4.023 sampel direproduksi dari model joblib yang disimpan, termasuk setelah pembatasan thread untuk mempercepat inferensi per frame.
- Preview memakai model yang dilatih tanpa pekerja 123. Pemilihan jenis model tetap memakai validasi pengembangan tiga pekerja, sehingga preview bukan pengujian independen sepenuhnya.
- Klip 30 detik menghasilkan 300 frame pada 10 FPS dalam 14 detik di RTX 5090. Satu frame preview diperiksa secara visual; seluruh prediksi klip belum diperiksa ahli.

## Data tambahan yang dibutuhkan

Prioritas pertama adalah label ahli per frame atau interval postur yang lebih pendek. Excel saat ini memberi skor per aktivitas, sementara postur dapat berubah di tengah aktivitas. Paket `sustage-frame-review.zip` berisi 24 gambar asli, `frame_labels.xlsx`, CSV, dan referensi MURI. Kolom skor sengaja kosong. Gunakan `unknown` jika bagian tubuh tidak terlihat atau skor tidak dapat dipastikan.

Ke-24 frame berasal dari data pengembangan yang sama dan hanya menjadi awal audit. Jumlah tersebut belum cukup untuk menjamin peningkatan model. Berkas `source_activity_labels.json` menyimpan asal label aktivitas secara terpisah; label itu bukan jawaban ahli per frame. Belum ada label hasil review yang digunakan melatih ulang.

Prioritas berikutnya adalah contoh risiko sedang dan tinggi dari pekerja tambahan. Pada 4.023 sampel, distribusi kelas 1/2/3 adalah:

| Komponen | Kelas 1 | Kelas 2 | Kelas 3 |
|---|---:|---:|---:|
| Tekukan pinggang | 3297 | 472 | 254 |
| Rotasi pinggang | 2718 | 1305 | 0 |
| Posisi lengan | 2683 | 775 | 565 |
| Tekukan lutut | 3792 | 199 | 32 |

Seluruh 32 sampel lutut kelas 3 berasal dari satu aktivitas pekerja 124. Saat pekerja tersebut dikeluarkan untuk validasi, training tidak memiliki contoh lutut kelas 3. Sisihkan pekerja baru untuk pengujian akhir sebelum memakai datanya dalam pemilihan model. GPU tambahan tidak mengatasi kekurangan contoh dan ketidakpastian label ini.

## Mengulang hasil

Dari root paket, gunakan lingkungan Python yang sama dengan README. Cache fitur memungkinkan training ulang model skor tanpa mengunduh seluruh video:

```bash
python improve.py repro/run_pose_x repeat_temporal
python physical.py repro/run_pose_x repeat_physical
python assemble.py repro/run_pose_x repeat_temporal repeat_physical repro/run_final repeat_improved
```

Untuk mengulang ekstraksi dari video asli, buat direktori baru dan jalankan:

```bash
python sustage.py prepare data baseline_new
python sustage.py extract baseline_new --sample-fps 2 --batch 32
python sustage.py train baseline_new
python upgrade_pose.py baseline_new pose_x_new
```

Jangan mencampur cache dari konfigurasi atau anotasi berbeda. Path video dalam manifest paket masih mengacu ke VPS; sesuaikan melalui langkah `prepare` saat memindahkan dataset. Paket hasil tidak menyertakan bobot eksperimen yang tidak dipakai, crop training, atau video sumber.
