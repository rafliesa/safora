# Skor postur MURI saat video berjalan

Model terbaru menghasilkan empat skor dari frame saat ini: tekukan pinggang, rotasi pinggang, posisi lengan, dan tekukan lutut. YOLO11x Pose pretrained pada input 960 mendeteksi sendi; model terpisah yang dilatih pada sustAGE memprediksi skor. Jika pose gagal, pipeline mencoba YOLO11s Pose pada 640. Bobot YOLO tidak dilatih ulang.

Model terbaru dan preview ada di `run_audited`. `muri_model.joblib` dilatih pada semua pekerja; `heldout_123.joblib` dilatih tanpa pekerja 123 untuk preview. Muat berkas joblib hanya dari sumber yang dipercaya. Versi ini memeriksa area kaki pekerja agar orang di belakang tidak menggantikan pekerja utama yang tertutup pintu.

## Hasil pengembangan

Audit dimulai dari 4.023 frame di 12 video dan tiga pekerja. Sebanyak 3.778 frame (93,9%) memiliki pose yang memenuhi batas area depan. Tabel membandingkan kedua model pada 3.778 frame yang sama; 245 frame tanpa pose yang memenuhi batas mendapat status tidak tersedia. Setiap pekerja bergantian dikeluarkan dari data training. Macro-F1 merata-ratakan kelas yang muncul pada label atau prediksi; rotasi pinggang hanya memiliki kelas 1 dan 2.

| Komponen | Sebelumnya | Terbaru |
|---|---:|---:|
| Tekukan pinggang | 0,336 | 0,332 |
| Rotasi pinggang | 0,612 | 0,631 |
| Posisi lengan | 0,513 | 0,518 |
| Tekukan lutut | 0,324 | 0,339 |

**Ini validasi pengembangan, bukan hasil pengujian independen.** Kandidat tiap komponen dipilih menggunakan hasil validasi tiga pekerja tersebut, sehingga angka bisa terlalu optimistis untuk pekerja baru. Peningkatan kecil dan tekukan pinggang sedikit turun; model belum andal untuk penilaian ergonomi operasional. Lihat [DEEP_ANALYSIS.md](DEEP_ANALYSIS.md) untuk audit, hasil validasi bertingkat, dan eksperimen 50 epoch. [IMPROVEMENT.md](IMPROVEMENT.md) mencatat eksperimen sebelumnya.

Preview 30 detik menghasilkan 300 frame pada 10 FPS dalam 14,34 detik di RTX 5090 32 GB. Waktu mencakup pemuatan model, pembacaan video, prediksi, dan penulisan MP4 awal; konversi H.264 dilakukan sesudahnya. Ini pengukuran satu klip, belum pengujian latensi kamera langsung. Skor dihitung ulang pada setiap frame keluaran tanpa menunggu akhir aktivitas atau membaca frame masa depan.

## Menjalankan prediksi

Di VPS, gunakan direktori `/workspace/sustage`. Paket ZIP dapat diekstrak ke direktori lain dengan struktur yang sama. PyTorch dan torchvision dengan dukungan GPU sudah tersedia di lingkungan VPS; pengujian memakai PyTorch 2.14.1+cu130.

```bash
cd /workspace/sustage
source /venv/main/bin/activate
pip install -r requirements.txt
python -m unittest -v test_sustage
python sustage.py predict \
  'data/sustAGE Actions+Postures videos/sustAGE_Station10_User123/2.May24_User_123_WS10_morning_cycles_L_view.avi' \
  run_audited/heldout_123.joblib preview_raw.mp4 --start 360 --seconds 30
ffmpeg -nostdin -i preview_raw.mp4 -c:v libx264 -crf 23 -pix_fmt yuv420p \
  -movflags +faststart preview.mp4
```

Untuk video baru, ganti path video dan gunakan `run_audited/muri_model.joblib`. `--start` dan `--seconds` menentukan bagian video dalam detik. Pilihan `--roi xmin ymin xmax ymax` membatasi area pekerja dengan koordinat relatif 0–1. Model terbaru mensyaratkan bagian bawah kotak pekerja berada di bawah 65% tinggi gambar, sesuai kamera yang diaudit. Aturan ini perlu dikalibrasi ulang untuk posisi kamera berbeda dan belum menjamin identitas pekerja pada adegan ramai.

Paket hasil tidak menyertakan video asli dan bobot YOLO publik. Ultralytics mengunduh `yolo11x-pose.pt` dan `yolo11s-pose.pt` saat pertama dijalankan jika belum ada. Kedua bobot sudah tersedia di VPS. Paket menyertakan model skor, kode, preview, hasil evaluasi, dan cache fitur untuk mengulang pelatihan model skor.

## Ekspor tabel setiap detik

Perintah `export` menjalankan deteksi sekali per detik video dan menulis satu baris CSV untuk setiap sampel. Perintah ini memakai model frame saat ini seperti `run_audited/muri_model.joblib`; model eksperimen yang membutuhkan konteks temporal atau seluruh aktivitas tidak didukung.

```bash
python sustage.py export video.avi run_audited/muri_model.joblib skor_per_detik.csv
```

Tanpa pilihan waktu, seluruh video diproses. Tambahkan `--start 360 --seconds 30` untuk bagian video sepanjang 30 detik mulai detik 360. Nama output harus baru agar CSV sebelumnya tidak tertimpa. File ditulis selama pemrosesan; ini belum merupakan koneksi kamera langsung.

Setiap baris memuat empat skor, status pose, serta koordinat X/Y dan confidence untuk 17 titik tubuh. `second` menghitung detik sejak awal bagian yang dipilih, sedangkan `timestamp_s` adalah waktu sampling pada video asli. `frame_time_s` menyimpan waktu frame terdekat yang benar-benar dibaca, sehingga selisih pada video ber-FPS pecahan terlihat. Pemilihan frame tidak mengakumulasi pembulatan FPS.

Koordinat memakai piksel gambar asli dengan titik nol di kiri atas; X bertambah ke kanan dan Y ke bawah. Titik dengan confidence di bawah 0,3 memiliki koordinat kosong. Confidence adalah keyakinan detektor titik tubuh atau orang, bukan keyakinan skor MURI. Jika pekerja tidak terbaca, status menjadi `pose_unavailable` dan skor serta titik dikosongkan; baris waktunya tetap ada.

Hasil merupakan pengamatan satu frame per detik, bukan rata-rata atau skor maksimum semua frame dalam detik tersebut. Gerakan singkat di antara sampel dapat terlewat. Contoh CSV dan Excel ada di `tabular_example`; Excel memisahkan sheet `Scores` dan `Keypoints` agar mudah dibaca. Contoh memakai model yang dilatih tanpa pekerja pada video.

## Data dan batas penilaian

[Anotasi visual tambahan User124](annotations/user124_ws10_afternoon/README.md) tersedia dalam Excel dan CSV: 247 sampel per detik dengan label aktivitas, badan condong, oklusi, serta bukti gambar. Saya juga meninjau 151 frame rapat pada aktivitas palu dan memeriksa Excel ahli asli. Label tambahan berasal dari tinjauan asisten, belum divalidasi ergonomis, dan belum dipakai untuk melatih ulang model. Kolom risiko CTS/LBP tetap kosong ketika pengukuran paparan yang diperlukan belum tersedia.

[Dashboard HEALY](../demo/README.md) menampilkan skrining paparan postural dari video melalui `video_exposure.py`: kategori lengan/bahu dan punggung, estimasi durasi skor ≥2, cakupan titik tubuh, serta kandidat gerak. Kategori mengikuti komponen MURI yang diprediksi pada setiap detik dan ditahan ketika titik yang diperlukan kurang jelas. Jalankan `bash demo/run.sh` dari root proyek. Hasil dapat diekspor ke CSV; dashboard memakai pengamatan rekaman dan tidak memakai model sintetis atau preset asumsi.

Percobaan penghitung gerakan siku dari video tersedia di [REPETITION.md](REPETITION.md). Modul mengambil 10 sampel per detik dan mengekspor kandidat siklus gerak beserta waktu serta cakupan titik tubuh. Jumlah kandidat belum mewakili genggaman, repetisi tugas, HAL, atau frekuensi pengangkatan.

Prototipe penilaian paparan terkait CTS dan low back pain tersedia melalui `python risk.py demo artifacts/risk_demo` dan `python risk.py assess skor_per_detik.csv artifacts/risiko_video`. Lihat [RISK.md](RISK.md) untuk contoh sintetis, input pengukuran, dan batas metode. Tanpa pengukuran tugas, penilaian CTS/RNLE tetap tidak tersedia. Model cloud beserta bobot pose sudah disalin ke [models/sustage](../models/sustage/README.md).

Dua classifier paparan tambahan tersedia di [models/risk_synthetic](../models/risk_synthetic/README.md). Tambahkan `--model ../models/risk_synthetic/risk_model.joblib` pada perintah `risk.py assess` untuk menampilkan prediksi model di samping hasil rumus. Model ini belajar dari metadata sintetis; bobot pose tetap sama. Dependensi khusus model paparan ada pada `risk-requirements.txt`.

Sumber: [sustAGE User Postures & Actions Monitoring](https://zenodo.org/records/7043787). Arsip video telah diperiksa dengan MD5 `0d307dc4d4c4971701e873cc8e4f6cd9`.

Label ahli berlaku per interval aktivitas. Label tersebut diwariskan ke frame sampel, sehingga hasil per frame belum divalidasi terhadap label ahli per frame. Empat skor ini tidak mencakup total MURI lengkap, berat beban, atau detail pergelangan tangan. Rotasi pinggang skor 3 tidak memiliki contoh; lutut skor 3 hanya muncul pada satu aktivitas dari pekerja 124.

Parser menangani detik, menit.detik, dan menit:detik berdasarkan kecocokan durasi anotasi. Empat baris bermasalah dipisahkan. Frame pada interval yang tumpang tindih atau dengan pose yang tidak cukup terlihat dikeluarkan. Tiga sudut kamera yang banyak menutupi pekerja memakai pasangan kamera yang lebih jelas. Sinkronisasi setiap aktivitas belum diverifikasi manual.

Hasil terbaru disalin ke `training/artifacts/audited` di komputer lokal; paket sebelumnya tetap ada di `training/artifacts/improved`. VPS masih aktif dan dapat terus dikenai biaya. `/workspace` VPS tidak memiliki volume persisten; menghapus atau melakukan recycle instance dapat menghilangkan data yang belum disalin.

## Eksperimen UW-IOM di cloud

Classifier paparan ergonomi berbasis skeleton sudah dilatih terpisah pada UW-IOM. Macro-F1 pada empat peserta uji adalah 0,598; targetnya kelas paparan turunan aktivitas, bukan probabilitas MSD. Hasil dan batas penggunaan tersedia di [models/uwiom](../models/uwiom/README.md), dengan [kode eksperimen](uwiom/README.md). Dashboard menampilkan model ini pada panel eksperimen tersendiri, bersama komponen MURI.
