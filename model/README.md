# Model paparan ergonomi

Folder ini berisi bobot model, kode inferensi, dan adapter data untuk backend. Frontend menggunakan proyek di `origin/master`; dashboard Python lama disimpan sebagai arsip.

```text
model/
├── infer.py              # Video / CSV pose → JSON + CSV hasil
├── integration.py        # Hasil model → ObservationWindow frontend origin
├── run.sh                # Launcher environment lokal
├── requirements.txt
├── weights/              # MURI, YOLO Pose, UW-IOM + checksum
├── reports/              # Evaluasi model
├── examples/             # Contoh output dan payload frontend
├── tests/                # Tes inferensi dan adapter
├── training/             # Kode bersama inferensi serta eksperimen pelatihan
├── outputs/              # Hasil per job; tidak masuk Git
└── archive/              # Demo lama, model historis, input referensi; tidak masuk Git
```

## Jalankan di mesin ini

Environment yang sudah bekerja dipindahkan ke `model/.venv`. Gunakan launcher agar konfigurasi library NixOS lokal ikut dimuat. Tidak perlu menjalankan ulang training.

Dari root repository:

```bash
bash model/run.sh \
  --video '/path/ke/video.avi' \
  --output-dir model/outputs/job-001 \
  --device cpu
```

Di VPS yang memiliki environment CUDA yang cocok, jalankan `python model/infer.py ... --device 0`. Pipeline mengambil satu sampel per detik. Proses video CPU tidak dijamin real-time. ROI opsional: `--roi 0 0 1 1`, dengan batas relatif XMIN YMIN XMAX YMAX. Detektor memilih pekerja depan terbesar di ROI; ini belum tracking identitas beberapa pekerja.

Untuk memakai CSV pose yang sudah diekstrak, tanpa menjalankan YOLO lagi:

```bash
bash model/run.sh \
  --postures model/tests/fixtures/postures.csv \
  --duration 246.5666666667 \
  --output-dir model/outputs/csv-001
```

`--postures` menerima CSV mentah dari `tabular.export`: grid timestamp 0,1,2,…, empat skor MURI, status, dan koordinat/confidence COCO. `--duration` harus berasal dari metadata video asli. Input bukan CSV ringkasan atau segmen yang dimulai pada timestamp selain nol. Hasil MURI pada mode CSV berasal dari input, sehingga hash model MURI pada metadata hasil dikosongkan.

Output setiap job:

- `postures.csv`: skor MURI dan titik tubuh mentah.
- `samples.csv`: skor, status, durasi, siklus postur, dan kelas UW-IOM per detik.
- `result.json`: metadata, checksum model/input, ringkasan dan semua sampel. Berkas ini hanya diterbitkan saat job berhasil.

Direktori output harus baru; hasil sebelumnya tidak ditimpa. Job gagal bisa meninggalkan `postures.csv` parsial tanpa `result.json`. Anggap job tersebut gagal, bukan hasil selesai. Model sintetis CTS/LBP tidak dipakai dalam pipeline ini.

## Pasang di mesin lain

Gunakan Python 3.11+ yang didukung paket-paketnya. Environment lokal yang diuji memakai Python 3.13.15, PyTorch 2.15.0+cpu dan torchvision 0.29.2+cpu. Salinan `.venv` dan `local-env.sh` bukan paket deployment; buat environment baru di mesin tujuan.

```bash
python3 -m venv model/.venv
model/.venv/bin/python -m pip install --upgrade pip
# Contoh CPU; untuk GPU gunakan build PyTorch yang cocok dengan GPU/driver tujuan.
model/.venv/bin/python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
model/.venv/bin/python -m pip install -r model/requirements.txt
```

Pada VPS RTX 5090 sebelumnya, PyTorch 2.14.1+cu130 sudah bekerja; pakai environment itu. Jangan mengganti driver host. Paket sistem decoder/library OpenCV juga perlu tersedia sesuai OS. Instalasi bersih lintas OS belum diuji.

Salin `infer.py`, `integration.py`, `training/`, `weights/`, dan `requirements.txt` ke backend. Runtime minimum dari `training/` adalah `sustage.py`, `tabular.py`, `improve.py`, `physical.py`, `deep.py`, `video_exposure.py`, dan `uwiom/model.py`; eksperimen/artifact lain tidak diperlukan untuk inferensi. Tidak perlu membawa `archive/`, `.venv`, video sumber, atau frontend demo. `weights/manifest.json` diperiksa setiap job; jangan memuat joblib dari unggahan pengguna.

**Bobot biner diabaikan Git**, termasuk YOLO11x yang melebihi 100 MB. Untuk deployment, distribusikan empat berkas pada `weights/manifest.json` melalui storage artifact atau Git LFS. Clone kode saja tidak cukup.

## Model dan batas hasil

- YOLO Pose mendeteksi sendi. MURI memprediksi empat komponen postur 1–3; bukan skor REBA.
- UW-IOM memprediksi `low`, `moderate`, `high`, atau `null` jika 12 sendi tidak memenuhi syarat. Macro-F1 peserta uji 0,598; recall kelas tinggi sekitar 56%. Kelas berasal dari label aktivitas, bukan kejadian MSD.
- Pada video contoh, UW-IOM terbaca pada 48/247 sampel. Perpindahan Kinect training ke YOLO/kamera lain belum tervalidasi.
- Siklus postur = rendah → sedang/tinggi → rendah; data hilang memutus siklus. Ini bukan jumlah genggaman atau angkatan beban. Pipeline paket ini tidak menjalankan deteksi siklus siku 10 Hz.
- Probabilitas MSD tetap `null`. Durasi adalah estimasi dari interval sampel 1 Hz, bukan pengukuran kontinu.

[INTEGRATION.md](INTEGRATION.md) menjelaskan penyambungan ke frontend origin dan field yang tidak boleh dikonversi menjadi REBA/poin.

## Verifikasi

```bash
# Mesin ini: environment NixOS lokal.
bash -c 'source model/local-env.sh; model/.venv/bin/python -m unittest discover -s model/tests -v'
# Mesin dengan environment ML aktif:
python -m unittest discover -s model/tests -v
```

Fixture uji berasal dari prediksi video sustAGE User124, bukan label klinis. Sumber dataset: [sustAGE, CC BY 4.0](https://zenodo.org/records/7043787), [UW-IOM, CC BY 4.0](https://data.mendeley.com/datasets/xwzzkxtf9s/3). Lisensi library dan bobot pretrained tetap mengikuti penerbitnya; lisensi dataset tidak menggantikannya.
