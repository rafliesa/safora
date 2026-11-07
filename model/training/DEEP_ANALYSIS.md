# Audit pemilihan pekerja dan eksperimen lanjutan

Perbaikan terbesar pada putaran ini adalah mencegah pose orang di belakang dipasangkan dengan label pekerja utama. Perubahan model menaikkan F1 rotasi dan lutut sedikit, tetapi belum menghasilkan penilaian postur yang andal.

## Orang yang dipilih dapat berbeda dari orang yang diberi label

Pada video 8, sekitar detik 209 dan 215, pekerja utama tertutup pintu. YOLO mendeteksi orang yang berjalan di belakang dan pemilih lama menerima deteksi itu karena bagian bawah kotaknya melewati 55% tinggi gambar. Label lutut pekerja utama kemudian dipasangkan dengan pose orang tersebut. [Gambar audit deteksi](audit/selection_audit.jpg) memperlihatkan contoh yang diperiksa.

Batas area depan dinaikkan menjadi 65% tinggi gambar, berdasarkan posisi kaki pada kamera ini. Detektor mencoba YOLO11x Pose 960, lalu YOLO11s Pose 640 jika pose yang memenuhi syarat belum tersedia. Tanpa pose yang memenuhi syarat, aplikasi menampilkan "Pose unavailable - no score". Aturan ini bukan pelacakan identitas; kamera berbeda atau beberapa orang di area depan memerlukan kalibrasi ROI atau tracking.

Ekstraksi ulang dimulai dari 4.023 timestamp yang sama. Sebanyak 3.778 frame memenuhi syarat dan 245 tidak tersedia, sehingga cakupan menjadi 93,9%. Angka 245 adalah jumlah frame yang ditolak oleh aturan baru, bukan jumlah kesalahan identitas yang sudah dikonfirmasi manual. Cache `canonical` mempertahankan semuanya beserta label, kotak deteksi lama/baru, dan status ketersediaan pada kolom `available`; cache `keypoints` hanya berisi pose yang tersedia untuk training.

## Perbandingan pada sampel yang sama

Kedua model pada tabel dinilai pada 3.778 frame yang sama, dengan setiap pekerja bergantian dikeluarkan dari training. Model baru memakai Random Forest untuk pinggang, regresi logistik dengan fitur simetris untuk rotasi, fitur geometri untuk lengan, dan Extra Trees dengan fitur simetris untuk lutut.

| Macro-F1 | Model sebelumnya | Model baru |
|---|---:|---:|
| Tekukan pinggang | 0,336 | 0,332 |
| Rotasi pinggang | 0,612 | 0,631 |
| Posisi lengan | 0,513 | 0,518 |
| Tekukan lutut | 0,324 | 0,339 |

Kandidat setiap komponen dipilih menggunakan hasil validasi pengembangan tersebut. Angka ini belum menjadi hasil pengujian independen. Pembanding sebelumnya dihitung ulang pada subset yang sama, sehingga nilainya berbeda dari laporan 4.023 frame. Hasil dengan pemilihan kandidat bertingkat, yang tidak memakai label pekerja uji dalam pemilihan pada fold itu, adalah 0,332 / 0,611 / 0,473 / 0,327. Validasi bertingkat belum menunjukkan peningkatan menyeluruh.

Jika seluruh 4.023 frame tetap dihitung dan tidak adanya skor dianggap sebagai target yang terlewat, F1 model baru menjadi 0,322 / 0,613 / 0,506 / 0,327. Kelas "tidak tersedia" tidak dihitung sebagai kelas MURI baru. Laporan `run_audited/metrics.json` menyimpan ketiga cara pelaporan ini, confusion matrix, serta hasil per pekerja.

Lutut masih bermasalah: model baru hanya mengenali 5 dari 167 contoh skor 2 pada subset tersedia, dan tidak mengenali satu pun dari 32 contoh skor 3. Kenaikan macro-F1 tidak berarti model sudah dapat mengenali postur lutut berisiko dengan baik. Recall pinggang skor 3 juga di bawah 1% pada evaluasi ini.

## Distribusi label membatasi pengujian pekerja baru

Setelah audit, pekerja 123 memiliki 884 frame dan seluruh label pinggang serta lututnya adalah skor 1. Pekerja 124 memiliki 32 contoh lutut skor 3; semuanya berasal dari satu aktivitas selama 16 detik. Pekerja 127 hanya memiliki dua frame lutut skor 2 yang masih memenuhi syarat dan tidak memiliki skor 3.

Saat pekerja 124 dikeluarkan, training tidak memiliki contoh lutut skor 3 dan hanya memiliki dua contoh skor 2. Tambahan epoch tidak dapat menggantikan variasi tersebut. Distribusi kamera dan stasiun juga berbeda: pekerja 123 hanya ada di Station 10, sedangkan pekerja 127 ada di Station 20 dan 30.

Label Excel berlaku sepanjang aktivitas. Pada contoh lutut skor 3 yang diperiksa, sudut tekukan proyeksi 2D sekitar 14 dan 17 derajat. Referensi Excel menempatkan skor 3 pada tekukan lebih dari 60 derajat. Perbedaan ini belum membuktikan label salah: sudut proyeksi kamera berbeda dari sudut tubuh 3D, dan skor aktivitas belum tentu berlaku untuk setiap frame. Label asli tetap dipertahankan. [Gambar audit lutut](audit/knee_deep_audit.jpg) menyediakan contoh untuk diperiksa ahli; [referensi MURI](audit/reference_readable.jpg) telah dirender dengan latar putih agar teksnya terlihat.

## Eksperimen yang dijalankan

Sembilan kandidat diuji pada cache lama dan cache setelah audit. Kandidat mencakup model sebelumnya, fitur simetris kiri/kanan, serta pembobotan menurut kelas, aktivitas, dan pekerja. Algoritmanya regresi logistik, SVM, gradient boosting, dan Extra Trees. Fitur simetris hanya memakai ukuran tubuh dari frame saat ini; ID pekerja, stasiun, waktu, dan label aktivitas tidak menjadi fitur.

MobileNetV3 dengan input crop pekerja dan pose juga dilatih 50 epoch tetap, dibandingkan 15 epoch pada eksperimen terdahulu. Crop memakai kotak dari audit agar tidak mengulang kesalahan memilih orang; augmentasi hanya mengubah warna supaya gambar dan koordinat pose tetap sesuai. Model 50 epoch menghasilkan F1 0,335 / 0,579 / 0,430 / 0,317 pada 3.778 frame. Loss training turun, tetapi generalisasi tetap rendah, sehingga bobot tersebut tidak dipakai dalam model akhir. Angka 15 dan 50 epoch tidak merupakan ablation epoch murni karena cache dan augmentasinya berubah.

Untuk membedakan pekerja baru dari sesi baru, model juga diuji dengan training seluruh sesi pagi dan pengujian seluruh sesi sore, lalu arah sebaliknya. Kamera dari rekaman yang sama tetap dalam satu kelompok. Dengan kombinasi model lama yang tetap, F1 pinggang mencapai 0,513; baseline mencapai 0,472. Angka tersebut mengizinkan pekerja yang sama muncul saat training dan pengujian, sehingga tidak boleh menggantikan hasil pengujian pekerja baru. Hasil sesi selengkapnya ada di `experiments/run_session/metrics.json`.

## Validasi dan berkas hasil

Delapan belas unit test lulus. Identitas pekerja, interval, timestamp, dan label semua sampel dibandingkan dengan cache sebelumnya. Prediksi 3.778 frame direproduksi dari model yang sudah disimpan, termasuk dengan pengaturan satu thread untuk inferensi. Pengujian juga mencakup penolakan orang di belakang pada contoh kegagalan, simetri fitur, dan bobot antarpekerja.

`run_audited/preview.mp4` berisi 30 detik video pekerja 123, diproses menjadi 300 frame pada 10 FPS dalam 14,34 detik di RTX 5090. `run_audited/occlusion.mp4` memperlihatkan penanganan pekerja yang tertutup. Keduanya memakai model yang dilatih tanpa pekerja pada video; pemilihan jenis model tetap menggunakan validasi pengembangan tiga pekerja. Kamera langsung dan seluruh skor preview belum diperiksa ahli.

Model akhir, laporan, kode, dan cache fitur tersimpan dalam `sustage-audited.zip`. Video asli, crop training besar, bobot eksperimen neural yang tidak dipakai, dan bobot YOLO publik tidak disertakan. Ultralytics mengunduh bobot YOLO saat pertama diperlukan jika belum tersedia.

## Mengulang eksperimen

Dari root paket dengan lingkungan pada README:

```bash
python deep.py repro/run_foreground repeat_deep
python finalize_deep.py repro/run_foreground repeat_deep repro/run_improved repeat_audited
python session_eval.py repro/run_foreground repeat_session
```

Ekstraksi ulang dari video asli dan training neural memerlukan path dataset dalam manifest yang sesuai:

```bash
python foreground.py run_pose_x foreground_new
python neural.py prepare foreground_new crops_new
python neural.py train crops_new neural_new --epochs 50
```

Gunakan direktori baru agar hasil audit tidak tertimpa. Untuk peningkatan berikutnya, prioritaskan label ahli per frame pada contoh berisiko dan tertutup, lalu tambahkan pekerja dengan skor 2/3. Paket review 24 frame dari putaran sebelumnya tetap dapat dipakai sebagai awal audit, tetapi belum cukup untuk membuktikan peningkatan. Simpan pekerja baru terpisah untuk pengujian akhir.
