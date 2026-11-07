# Layanan inferensi lokal

API FastAPI menyambungkan frontend RAISE dengan `model/infer.py`. Upload langsung masuk antrean satu worker. Hasil, metadata rekaman, label, dan status job disimpan di `backend/data/` (SQLite + berkas), bukan di browser. Folder data tidak masuk Git.

## Menjalankan

Dari root repository, setelah environment dan bobot pada `model/README.md` tersedia:

```bash
uv pip install --python model/.venv/bin/python -r backend/requirements.txt
bash backend/run.sh
```

Terminal lain:

```bash
printf 'VITE_API_BASE_URL=/api\n' > frontend/.env.local
cd frontend
npm ci
npm run dev
```

Buka `http://localhost:3000`. Vite meneruskan `/api` ke `127.0.0.1:8000`. Kalau sesi browser sebelumnya memakai data demo, pilih mode data layanan. Gunakan **Recording Archive → Add recording**, unggah MP4/WebM yang bisa diputar browser, lalu tunggu panel **Model exposure results**. Upload diproses otomatis; tidak ada tombol mulai training/analisis.

`MODEL_DEVICE=0 bash backend/run.sh` menggunakan CUDA bila environment GPU tersedia. Default otomatis memilih CUDA, lalu Apple MPS, lalu CPU sesuai ketersediaan PyTorch. Gunakan `MODEL_DEVICE=cpu` untuk memaksa CPU. Device terpilih dicatat di `analysis.log`; proses video panjang di CPU dapat lambat. `HEALY_DATA_DIR=/path/data` memindahkan penyimpanan. Jalankan satu proses backend saja: satu worker antrean tidak membatasi duplikasi antarproses server. Tidak ada auto-retry job yang terputus restart; statusnya menjadi failed dan pengguna perlu mengunggah lagi. Berkas asli/hasil parsial tetap tersimpan untuk pemeriksaan.

Ini layanan **lokal**, bind loopback, tanpa login atau peran HSE server. Jangan mengeksposnya langsung ke internet. Mode produksi membutuhkan autentikasi/otorisasi, pembatasan upload di reverse proxy, kuota/retensi penyimpanan, dan worker terkelola. `npm run preview` tidak memakai proxy dev; untuk build produksi atur `VITE_API_BASE_URL` ke origin backend dan sesuaikan CORS/reverse proxy.

## Hasil dan asosiasi pegawai

- `POST /recordings` menerima multipart `file` + JSON `metadata`, mengukur durasi/resolusi video di server, memberi ID baru, menyimpan, lalu membalas 202 `Recording`. Maksimum berkas 2 GB. Metadata tidak boleh memilih path server.
- Job: `queued → processing → complete/failed`. Inference dijalankan subprocess memakai environment model, tanpa training ulang. `analysis.log` berada di direktori job.
- `GET /recordings/:id/result` memberi JSON `healy.model.v1`, dan `GET /recordings/:id/samples.csv` memberi tabel per detik. Keduanya menolak job belum selesai dengan 409. Media mendukung HTTP byte ranges.
- Panel rekaman membaca status setiap 3 detik sampai selesai, lalu kategori mengikuti waktu video. Sampel tidak terbaca tidak diganti kategori rendah. MURI dan UW-IOM ditampilkan terpisah.
- Label boleh disimpan untuk beberapa subjek, tetapi tidak otomatis membuat observasi pegawai. Untuk mengaitkan hasil, pengguna harus meninjau video dan mengonfirmasi tepat **satu pekerja depan yang sama sepanjang rekaman**; server memeriksa satu label mencakup 0 sampai durasi video.
- Asosiasi ini dicatat sebagai `operator_confirmation`, bukan identifikasi otomatis atau persetujuan HSE. Model memilih orang depan terbesar di ROI dan belum melacak identitas. Jangan konfirmasi bila orang yang dipilih berganti/ada beberapa subjek yang ambigu. Mengedit label membatalkan centang di form dan perlu konfirmasi ulang.
- `/observations` hanya memuat rekaman selesai dengan asosiasi terkonfirmasi. Kontribusi interval, ID stabil, revisi label, dan nilai REBA/poin yang tetap null mengikuti `model/integration.py`. Semua observasi membutuhkan bukti/review. Periode memakai timezone permintaan.
- Untuk liputan pegawai yang bertumpang tindih, interval paling awal (tie: ID rekaman) menang; interval berikutnya yang beririsan dilewati seluruhnya. Aturan konservatif ini mencegah penghitungan ganda, tetapi bisa mengurangi cakupan pada overlap parsial.
- `GET /workers` berasal dari label yang disimpan. Tidak ada pegawai atau hasil demo yang dibuat backend. `/live-sources` dan `/noise-readings` kosong karena belum ada integrasi kamera live/instrumen kebisingan.

Review HSE di frontend tetap lokal. Endpoint review/worksheet legacy belum diimplementasikan. REBA, Table C, poin RAISE, probabilitas penyakit, dan hasil kebisingan tidak diturunkan dari kelas UW-IOM.

## Repetitions, demo MSD review, and frame skeleton

`result` and CSV exports include repetitions for arms, back, and UW-IOM. A repetition completes on **Low → Moderate → Low**; High may occur inside the bout, but Moderate must have been observed. Missing observations and gaps break the cycle. The player shows the count at its current time and the total for the recording. Exposure percentages are duration-weighted Moderate/High time divided by readable time, with coverage shown separately.

`backend/run.sh` loads `backend/.env`. Set `OPENAI_API_KEY` and optionally `OPENAI_MSD_MODEL` (otherwise `OPENAI_VISION_MODEL`, then `gpt-4.1-mini`). After inference, the backend sends only aggregate exposure measurements to the OpenAI Responses API with structured output and `store: false`. It does not send video, filenames, or employee identities. Interpretations are cached in SQLite; failure leaves the model output intact. Existing completed recordings without a review are queued at startup. Reopening a page does not call OpenAI again.

All recordings appear on `/employees/demo-a` as **Employee A (Demo)**, explicitly assuming one employee for demonstration. This does not change manual labels or verified observation windows. The LLM names candidate MSD conditions and qualitative ergonomic review priorities; clinical disease probability remains null. The UI is English and omits the detailed limitations section.

- `GET /workers/demo-a/msd-analysis`: measured exposure, repetitions, and cached interpretations for all completed recordings.
- `POST /recordings/{id}/msd-analysis`: start or retry an interpretation; an existing successful result is reused.
- `GET /recordings/{id}/pose`: cached frame poses, or a pending/failed status.
- `POST /recordings/{id}/pose`: retry frame-pose extraction.

The skeleton uses the same primary/fallback YOLO checkpoints, image sizes, and foreground-person selection as exposure inference, evaluated on **every video frame**. It is cached once in `backend/data/{id}/pose.json`; failures are recorded in `pose.log`. The browser uses `requestVideoFrameCallback` to follow playback and seeking. Low-confidence joints are omitted. While the full cache is processing, the UI explicitly identifies the one-second fallback. This frame cache is visual evidence: exposure scoring and repetition calculations retain their one-second sampling. Selecting the largest foreground person does not establish identity in multi-person scenes. GPU-enabled PyTorch is recommended for frame-by-frame processing.

## Pengujian

```bash
uv pip install --python model/.venv/bin/python httpx
model/.venv/bin/python -m unittest backend.test_app -v
npm --prefix frontend test
npm --prefix frontend run build
```

Tes API memakai runner terisolasi untuk memeriksa penyimpanan, error, range, asosiasi manual, revisi, dan overlap. Uji browser video nyata tersedia di `check_browser.py`; membutuhkan Playwright, Chrome, dan klip `/tmp/healy-integration-clip.mp4`. Jalankan backend di port 8000 dengan `HEALY_DATA_DIR` direktori uji **baru**, serta Vite di 3000; skrip membuat label/rekaman QA, sehingga jangan menjalankannya pada penyimpanan operasional. Skrip tidak mencegat request upload: berkas biner melewati proxy Vite yang sebenarnya.

AVI and MKV uploads are probed on the server, then converted to H.264 MP4 for browser playback before inference. The original file is retained and used by the model. Install FFmpeg (with libx264), or set FFMPEG_BINARY to its executable path. Conversion runs in the job queue; progress appears in the results panel and failures are logged in playback.log. Allow disk space for both copies.
