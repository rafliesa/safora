# Eksperimen paparan ergonomi UW-IOM

Model ini memprediksi kelas paparan ergonomi berdasarkan label aktivitas UW-IOM. Ini bukan model probabilitas kejadian MSD dan bukan pengganti penilaian REBA lengkap. Model dilatih di VPS RTX 5090, terpisah dari model MURI sustAGE yang digunakan dashboard.

Sumber: [UW-IOM versi 3, CC BY 4.0](https://data.mendeley.com/datasets/xwzzkxtf9s/3). `source_manifest.json` mencatat URL, ukuran, dan SHA-256 penerbit. Subset yang dipakai adalah `JointPositions`, `VideoLabels`, dan README; video besar tidak diperlukan untuk eksperimen skeleton ini. Label aktivitas dipetakan ke tiga kelas sesuai bagian V-B1 [Parsa et al. (2019)](https://arxiv.org/html/1902.05176#S5.SS2.SSS1). Label tersebut berlaku per jenis aktivitas, bukan hasil pemeriksaan kesehatan atau anotasi REBA ahli pada setiap frame.

## Input dan pemisahan data

Input memakai 12 titik 2D: bahu, siku, pergelangan tangan, pinggul, lutut, dan pergelangan kaki kiri/kanan. Posisi dipusatkan pada pinggul dan diskalakan dengan panjang torso. Model menerima koordinat relatif dan jarak antartitik; posisi absolut kamera tidak digunakan. Jaringan MLP dilatih dari awal untuk klasifikasi paparan; bobot YOLO pretrained tidak diubah. Tidak ada data sintetis dalam training ini.

Peserta training: 1, 2, 4, 5, 7, 8, 10, 11, 13, 14, 16, 17. Validasi yang direncanakan: 3, 9, 15, 19. Pengujian akhir: 6, 12, 18, 20. Peserta 15 dikeluarkan sepenuhnya karena 1.546 label tidak cocok dengan rentang 1.548 frame yang didokumentasikan. Tidak dilakukan pergeseran atau pengisian label. Pemisahan ditentukan sebelum fitting; peserta pengujian tidak dipakai memilih epoch atau normalisasi. Ini satu pemisahan peserta pada satu lokasi, bukan validasi lintas tempat kerja.

Nomor frame pada README diinterpretasikan sebagai indeks MATLAB 1-based inklusif. Frame hanya dipakai jika timestamp RGB dan skeleton cocok dengan toleransi 1 mikrodetik. Koordinat kosong, nonfinite, atau geometri degenerat dikeluarkan. Tidak tersedia confidence tracking Kinect dalam file yang dibaca, sehingga filter training terbatas pada koordinat. Offset frame belum diaudit visual terhadap video asli.

## Menjalankan di cloud

Gunakan environment `/venv/main` yang sudah memiliki PyTorch CUDA, NumPy, dan scikit-learn; pembacaan MATLAB v7.3 juga membutuhkan `h5py`.

```bash
cd /workspace/sustage/uwiom
/venv/main/bin/python download.py ../uwiom_source_manifest.json data
/venv/main/bin/python -m unittest -v test_model
/venv/main/bin/python train.py data run_baru
```

Direktori hasil wajib baru agar checkpoint lama tidak tertimpa. Eksperimen pertama dikelola supervisor dengan nama `safora-uwiom-20261107`; tidak otomatis mengulang training setelah selesai. Log: `/workspace/sustage/uwiom/training_20261107.log`.

`report.json` memuat hasil validasi/pengujian, confusion matrix, hasil per peserta, baseline kelas mayoritas, audit sampel, dan SHA-256 model. `test_predictions.csv` memuat prediksi peserta uji beserta frame sumber. Model tersimpan di `exposure_model.pt`.

## Mencoba CSV dari video

```bash
python training/uwiom/predict.py \
  training/artifacts/user124_afternoon_prediction/posture_per_second.csv \
  models/uwiom/exposure_model.pt hasil_paparan.csv
```

Perintah membutuhkan environment PyTorch/NumPy yang berfungsi. Seluruh 12 sendi harus terbaca dengan confidence minimal 0,5; jika tidak, hasilnya kosong. CSV keluaran tidak menimpa file lama. Kolom `clinical_msd_probability` selalu kosong, dan `domain_validated` selalu false. Uji pada CSV sustAGE hanya memeriksa jalur inferensi, bukan mengukur akurasi, karena tidak ada label UW-IOM yang sepadan untuk video itu.

Perbedaan objek dan aktivitas dapat mengubah label walaupun pose mirip. Selain itu, pose Kinect training berbeda dari estimasi YOLO pada kamera lain. Model ini ditampilkan pada panel eksperimen tersendiri di dashboard; angka evaluasinya tidak boleh dianggap sebagai akurasi MSD pada video unggahan bebas.
