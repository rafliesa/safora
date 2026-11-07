# Contoh keluaran model untuk pengujian

`posture_30s.csv` memuat waktu, status, dan empat skor dari `tabular_example/posture_per_second.csv`. Sumbernya adalah video sustAGE User123 WS10 morning, detik 360-389, menggunakan `run_audited/heldout_123.joblib`. Label di file ini merupakan prediksi model yang belum diperiksa ahli per frame. File ini tidak memuat label CTS atau low back pain.

Pengujian memakainya untuk memastikan pengamatan postur tidak otomatis menjadi penilaian risiko ketika pengukuran tugas belum tersedia.
