# Prototipe paparan ergonomi terkait CTS dan low back pain

`risk.py` menggabungkan pengamatan MURI per detik dengan penilaian tugas. Program menghasilkan CSV, Excel, dan ringkasan JSON. Perhitungan berjalan di CPU dan memakai Python serta `openpyxl` yang sudah tercantum pada `requirements.txt`.

Model video masih memprediksi empat komponen MURI. Modul paparan menghitung indeks dari data tugas yang diisi pengguna. Dua classifier tambahan sudah dilatih untuk meniru kategori paparan pada data sintetis. Prototipe belum memprediksi kemungkinan seseorang terkena penyakit dan belum menjalani validasi terhadap penilaian ahli di lokasi kerja.

## Model paparan yang sudah dilatih

File `models/risk_synthetic/risk_model.joblib` di root proyek memuat logistic regression untuk CTS dan histogram gradient boosting untuk kategori RNLE. Kedua classifier memakai metadata tugas; bobot YOLO dan model MURI tidak berubah. Classifier tidak menerima gambar atau koordinat sendi.

Training memakai 30.638 skenario, validasi memakai 2.160, dan pengujian memakai 5.197 skenario yang terpisah. Data berasal dari 1.000 skenario awal serta tambahan skenario dengan seed yang berbeda. Proses membuang duplikasi input pada kedua target dan memilih kandidat menggunakan macro-F1 validasi. Model tersimpan hanya dilatih pada bagian training. Waktu training dan evaluasi di CPU lokal sekitar 22 detik.

| Target kategori | Macro-F1 uji sintetis | Macro-F1 dekat batas kategori |
|---|---:|---:|
| Paparan tangan terkait CTS | 0,9991 | 1,0000 (815 kasus) |
| Indeks angkat terkait punggung | 0,9601 | 0,5521 (940 kasus) |

Seluruh label uji berasal dari rumus yang sama dengan label training. Angka tersebut mengukur kesesuaian terhadap rumus pada skenario sintetis, bukan kemampuan memprediksi penyakit atau generalisasi ke pekerja nyata. Pengujian dekat batas menggunakan gaya ±0,02 dari batas HAL dan beban dengan LI ±0,02 dari 1 atau 3. Frekuensi angkat pada pengujian itu memakai nilai kontinu. Recall kategori punggung tertinggi pada pengujian dekat batas hanya 0,464.

Model hanya menggunakan parameter input yang tersedia saat penggunaan. Indeks, RWL, kategori target, ID skenario, dan skor MURI buatan tidak menjadi fitur. Ketika penempatan akhir tidak memerlukan kontrol, model mengabaikan ukuran horizontal dan asimetri tujuan yang tidak memengaruhi penilaian tugas.

Gunakan dari root proyek lokal:

```bash
uv run --with-requirements training/risk-requirements.txt python training/risk.py assess \
  training/artifacts/risk_demo/synthetic_observations.csv \
  training/artifacts/risk_ml_demo_baru \
  --tasks training/artifacts/risk_demo/synthetic_tasks.json \
  --model models/risk_synthetic/risk_model.joblib
```

`--model` menambahkan kolom `cts_left_ml_*`, `cts_right_ml_*`, dan `low_back_ml_*`. Kolom `*_ml_category` berisi prediksi classifier, sedangkan kolom kategori dan indeks sebelumnya tetap memuat perhitungan rumus. Nilai bisa berbeda; hasil rumus tersedia untuk pemeriksaan. Program tidak mengubah skor classifier menjadi probabilitas penyakit.

Input yang hilang tetap menghasilkan `insufficient_data`. Input di luar rentang skenario menghasilkan `outside_training_domain`. Cakupan model tangan adalah HAL 0-9,8 dan gaya ternormalisasi 0,1-9. Cakupan model punggung meliputi beban 2-30 kg, frekuensi 0,2-8 angkatan/menit, dan pengangkatan ke atas 25-175 cm. Rentang geometri lainnya tercantum pada `DOMAIN` di `risk_ml.py`. Batas ini hanya pemeriksaan rentang input dan tidak menjamin semua kombinasi sudah terwakili.

Untuk mengulang training dengan direktori baru:

```bash
uv run --with-requirements training/risk-requirements.txt python training/risk_ml.py \
  training/artifacts/risk_demo/synthetic_scenarios.csv models/risk_synthetic_baru
cd training
uv run --with-requirements risk-requirements.txt python -m unittest -v test_risk test_risk_ml
```

Muat joblib hanya dari sumber yang dipercaya. Paket memakai scikit-learn 1.9.1; loader memeriksa versi ini. `training_plan.json` mencatat pembagian data dan parameter pemilihan model. `metrics.json`, `test_predictions.csv`, dan data terkompresi menyimpan hasil yang bisa diperiksa ulang.

## Menjalankan contoh sintetis

Dari folder `training`, jalankan:

```bash
python risk.py demo artifacts/risk_demo
```

Program membuat 1.000 skenario tabular dengan seed tetap dan contoh 150 detik. Semua file contoh menyatakan asal data `synthetic`. Lima interval memperagakan paparan di bawah batas, kebutuhan tindakan, paparan di atas batas, input yang hilang, dan tugas di luar penerapan metode.

`synthetic_scenarios.csv` menyimpan input serta label hasil rumus. `synthetic_tasks.json` menyimpan metadata interval. `assessment/risk_per_second.xlsx` memuat tabel per detik, input tugas, dan penjelasan. Label contoh tidak berasal dari video atau diagnosis pekerja. Contoh sintetis ini belum mencakup render manusia 3D atau tambahan training detektor pose.

## Mengolah hasil video

Gunakan CSV dari perintah `sustage.py export` yang sudah ada:

```bash
python risk.py assess skor_per_detik.csv artifacts/risiko_video
```

Tanpa metadata tugas, hasil CTS dan RNLE berstatus `insufficient_data`. Ringkasan tetap memuat proporsi sampel MURI 2 atau 3 serta cakupan pose. Proporsi tersebut merupakan ringkasan postur, bukan kategori risiko penyakit.

Untuk memakai pengukuran, salin `risk_task_template.json`, isi nilainya, lalu jalankan:

```bash
python risk.py assess skor_per_detik.csv artifacts/risiko_dengan_pengukuran --tasks pengukuran.json
python -m unittest -v test_risk
```

Folder output harus baru. Program membaca dan memeriksa input sebelum menulis. CSV kosong, nilai nonnumerik, NaN, skor lama pada pose yang hilang, interval tumpang tindih, dan nama kolom metadata yang keliru menyebabkan error.

`start_s` termasuk interval; `end_s` tidak termasuk interval. Keduanya memakai waktu video asli, sama dengan `timestamp_s`, bukan waktu relatif klip. Contoh video mulai detik 360 membutuhkan interval mulai 360. Penilaian tidak diteruskan melewati akhir interval. Satu file pengamatan berlaku untuk satu pekerja pada satu video.

## Input tugas dan sumbernya

`data_origin` pada metadata adalah `synthetic`, `external_assessment`, atau `unknown`. Isi `note` dengan sumber pengukuran, penilai, dan tanggal. Program menolak penilaian lengkap yang masih memakai asal `unknown`. Jika pengguna memasangkan metadata sintetis dengan video nyata, ringkasan dan Excel tetap menandai hasil sebagai demo sintetis.

`cts.left` dan `cts.right` menilai tangan secara terpisah. `applicable: true` menyatakan bahwa penilai telah memeriksa kecocokan metode. Isi `hal` dan `normalized_peak_force` pada skala 0-10; gaya dalam kilogram atau newton tidak boleh langsung masuk kolom ini. `task_hours_per_day` adalah durasi paparan harian, bukan panjang video. Prototipe membatasi HAL pada tugas repetitif yang sama selama 4-8 jam/hari. Penilaian beberapa tugas dalam satu hari memerlukan analisis tambahan.

HAL perlu penilaian frekuensi usaha tangan serta waktu kerja/pemulihan. Video tubuh 1 FPS dan posisi lengan belum menyediakan input itu. Nilai gaya memerlukan pengukuran atau penilaian yang sesuai. Modul tidak memperkirakan gaya dari posisi sendi.

`low_back.applicable: true` menyatakan bahwa penilai telah memeriksa syarat RNLE: angkat dua tangan, berdiri, beban stabil, ruang dan pijakan memadai, serta kondisi kerja sesuai manual. Tugas perakitan yang tidak melibatkan angkat sesuai syarat menggunakan `false`; tugas yang belum diperiksa menggunakan `null`.

| Input RNLE | Arti |
|---|---|
| `load_kg` | Berat beban dalam kg. |
| `origin_h_cm`, `destination_h_cm` | Jarak horizontal tangan dari titik tengah pergelangan kaki. |
| `origin_v_cm`, `destination_v_cm` | Tinggi tangan dari lantai dalam cm. |
| `origin_asymmetry_deg`, `destination_asymmetry_deg` | Sudut posisi beban terhadap bidang tengah tubuh, bukan otomatis sudut putaran badan dari MURI. |
| `destination_control` | Apakah penempatan akhir membutuhkan kontrol berarti; jika benar, kedua ujung angkatan dinilai. |
| `frequency_per_min` | Frekuensi angkat representatif, biasanya dari pengamatan 15 menit. |
| `duration_category` | `short`, `moderate`, atau `long`, setelah penilai memeriksa jadwal kerja/pemulihan. |
| `coupling` | Kualitas pegangan menurut manual: `good`, `fair`, atau `poor`. |

Kategori `short` mencakup kerja angkat sampai 1 jam dengan pemulihan setidaknya sama panjangnya. `moderate` mencakup lebih dari 1 sampai 2 jam dengan pemulihan setidaknya 0,3 kali waktu kerja. `long` mencakup lebih dari 2 sampai 8 jam dengan istirahat kerja yang sesuai. Sesi dengan pemulihan tidak cukup harus digabung menurut manual. Jangan memilih kategori berdasarkan durasi klip.

Prototipe menghitung setiap tugas secara terpisah. Hasilnya belum mencakup Composite Lifting Index untuk gabungan tugas dalam satu shift.

## Arti keluaran

`assessment_scope=task_metadata` berarti indeks berasal dari penilaian tugas yang diulang pada baris waktu terkait. Indeks dapat tetap tersedia saat pose hilang karena metadata tugas berasal dari luar video. Kolom `pose_status` dan skor MURI tetap mempertahankan status hilang. Perhitungan ini belum membuat prediksi risiko baru dari setiap frame.

| Kolom | Arti |
|---|---|
| `cts_left_index`, `cts_right_index` | Gaya puncak ternormalisasi dibagi batas TLV untuk HAL tersebut. |
| `cts_*_category` | `below_action_limit`, `at_or_above_action_limit`, atau `at_or_above_tlv`. |
| `low_back_index` | Lifting Index: berat beban dibagi Recommended Weight Limit. |
| `low_back_rwl_kg` | Batas berat rekomendasi dari perhitungan RNLE dalam kg. |
| `low_back_category` | `at_or_below_1`, `above_1`, `above_3`, atau `zero_recommended_weight_limit`. |
| `*_status`, `*_reason` | Status penilaian dan input yang masih dibutuhkan atau batas metode yang terlampaui. |
| `*_ge2_fraction_so_far` | Proporsi sampel MURI 2/3 dari sampel valid sampai waktu tersebut. |

Skor di bawah batas tidak menjamin pekerja bebas risiko. Nilai kosong berarti tidak tersedia. Jika batas TLV atau RWL nol, program tidak menulis Infinity dan tidak mengubah hasil menjadi paparan rendah. Batas AL negatif pada HAL tinggi tetap masuk perbandingan; program tidak memakai rasio negatif sebagai penanda paparan rendah.

Ringkasan menghitung sampel valid dan baris hilang. Sampel 1 FPS tidak membuktikan durasi gerakan kontinu atau jumlah repetisi cepat. Koordinat tubuh lengkap tetap tersedia pada CSV awal; tabel risiko memakai `timestamp_s` untuk menghubungkannya.

## Metode dan pemeriksaan

HAL memakai persamaan revisi 2018: batas TLV = `0.56 * (10 - HAL)` dan AL = `TLV - 2`. Prototipe memasukkan nilai tepat pada batas ke kategori tindakan yang lebih tinggi. Sumber: [Yung dan kolega, 2019](https://stacks.cdc.gov/view/cdc/97295).

RNLE memakai konstanta SI 23 kg dan pengali pada [manual NIOSH revisi 2021](https://stacks.cdc.gov/view/cdc/110725), termasuk interpolasi frekuensi dan batas jangkauan geometri. Pengali frekuensi memakai tinggi tangan awal, juga ketika menilai tujuan angkatan. Jika penempatan akhir membutuhkan kontrol, program memakai RWL terkecil dari kedua ujung.

Pengujian mencakup batas kategori, penyebut nol, input hilang, jadwal sampel, kesesuaian contoh manual, pemisahan sumber sintetis, dan perlindungan file. Hasil pengujian ini hanya menunjukkan perilaku perangkat lunak; validasi pada pekerja dan penilaian ahli masih diperlukan.
