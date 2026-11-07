# RAISE

RAISE is a local HSE workspace for reviewing employee exposure and recorded workplace video. A React frontend connects to a FastAPI backend that queues uploads and runs the packaged MURI and experimental UW-IOM models.

## Prerequisites

These instructions use Bash on Linux, macOS, or WSL. Install Git, Node.js 20.19+ with npm, and Python with venv and pip support. The existing model environment uses Python 3.13; package availability depends on your OS and Python version.

Install FFmpeg with libx264 support for AVI/MKV playback conversion. OpenCV may also need system libraries for your OS. GPU inference requires a compatible PyTorch build and driver; CPU inference can take longer than the video's duration.

## First-time setup

### Clone and install dependencies

~~~bash
git clone https://github.com/rafliesa/safora.git
cd safora
npm --prefix frontend ci
python3 -m venv model/.venv
model/.venv/bin/python -m pip install --upgrade pip
~~~

Run the remaining commands from the repository root. Create a new virtual environment on each machine; do not copy another machine's environment or its optional NixOS-specific model/local-env.sh.

For CPU inference, install PyTorch with:

~~~bash
model/.venv/bin/python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
~~~

For GPU inference, install the PyTorch and torchvision build that matches your OS, GPU, and driver into model/.venv instead of running the CPU-only command. Automatic detection cannot enable GPU support in a CPU-only build.

Then install the project dependencies:

~~~bash
model/.venv/bin/python -m pip install -r model/requirements.txt -r backend/requirements.txt
~~~

### Add the trained weights

Model binaries are excluded from Git. Obtain the trained artifacts from the project maintainer and put these files in model/weights/:

- exposure_model.pt
- muri_model.joblib
- yolo11s-pose.pt
- yolo11x-pose.pt

A code clone alone cannot run inference. Use the exact artifacts listed in [the checksum manifest](model/weights/manifest.json). Verify them from the repository root:

~~~bash
model/.venv/bin/python -c "from model.infer import verify_weights; print(verify_weights())"
~~~

The backend checks these hashes for each job. Only load trusted model artifacts; renaming unrelated checkpoints will not work.

## Run the frontend and model service

Start the backend in one terminal:

~~~bash
cd safora
bash backend/run.sh
~~~

If you are already in the repository root, skip the cd command.

Start the frontend in another terminal from the repository root:

~~~bash
VITE_API_BASE_URL=/api npm --prefix frontend run dev
~~~

Open **http://localhost:3000** and keep both terminals running. Vite forwards /api requests to the backend at 127.0.0.1:8000.

Select **Gunakan data layanan** if the browser still shows demo data. Open **Recording Archive → Add recording**, upload a video, and wait for **Model exposure results** on the recording page. Uploading queues analysis automatically; you do not need to run training or infer.py separately.

The backend loads model weights when each video job starts, not when the server starts. Each job runs in its own subprocess and reloads the models. A running backend therefore does not prove that the weights and model dependencies are ready.

### GPU selection

Video inference selects CUDA first, then Apple MPS, then CPU, according to availability in PyTorch. The selected device appears in the job's analysis.log. Pose extraction uses this device; other pipeline stages may still run on CPU.

To override automatic selection:

~~~bash
MODEL_DEVICE=cpu bash backend/run.sh
# Or use the first CUDA GPU:
MODEL_DEVICE=0 bash backend/run.sh
~~~

An explicit override must be available. Automatic selection does not retry a failed GPU job on CPU.

### Storage and troubleshooting

The backend stores recordings, results, and SQLite metadata in backend/data/. Set HEALY_DATA_DIR to choose another directory. Run one backend process: the queue processes one job at a time, and multiple server processes can duplicate work.

Interrupted jobs become failed after restart; upload again to retry. Inspect the recording's analysis.log for inference errors and playback.log for conversion errors. AVI/MKV conversion retains the original and creates a browser-compatible MP4, so allow space for both.

If you see demo data, select service mode and check that both servers are running. Missing weight files or checksum errors require the matching artifacts from the manifest. If GPU execution fails, check the PyTorch installation or restart with MODEL_DEVICE=cpu.

## Frontend-only demo

~~~bash
npm --prefix frontend run dev
~~~

Choose demo mode to explore sample dashboards without the backend or model weights. Demo results do not represent inference on uploaded videos. Browser-only recordings use IndexedDB, with metadata and labels in localStorage; clearing site data removes that local archive.

## Workspace behavior

| Route | Purpose |
| --- | --- |
| #/overview | Company exposure summary and review queue |
| #/employees | Employee directory and period filters |
| #/employees?review=needed | Employees with findings to review |
| #/employees/:id | Daily/weekly exposure, recordings, and local HSE reviews |
| #/cameras | Camera hub |
| #/cameras/:id | Source details and associated recordings |
| #/cameras/archive | Searchable recording archive |
| #/recordings/:id | Playback, labels, and model results |
| #/report/:id | Assessment report screen for service integration |

Cameras have no fixed employee owner. A recording can have multiple manual labels, but associating model results with an employee requires confirming exactly one foreground worker throughout the recording. The detector does not track identities across people or cameras.

The frontend refreshes workspace data every 60 seconds and when the tab becomes visible. HSE review decisions remain in localStorage and apply to a specific employee, period, snapshot, and revision; they are not server approvals.

## Model scope and limitations

MURI predicts posture components; UW-IOM predicts experimental exposure categories. These outputs do not provide REBA scores, RAISE points, clinical MSD probabilities, or noise measurements. Demo fixtures contain assessment fields that the local model does not produce.

Exposure scoring samples video at 1 Hz. Repetitions count Low → Moderate → Low transitions, not individual grips or lifts. A separate skeleton cache uses the same pose checkpoints on every video frame and follows playback. The camera domain and individual health outcomes remain unvalidated.

The backend reads `OPENAI_API_KEY` from `backend/.env` to generate cached English MSD interpretations from aggregate measurements. All completed recordings appear under `/employees/demo-a` as Employee A (Demo), without changing verified identity labels. Percentages describe measured exposure time, not clinical disease probability. See the backend guide for configuration and retry endpoints.

Live camera ingestion, continuous recording, and authenticated deployment are not implemented. The backend binds to loopback and has no login; keep it local.

See the [backend guide](backend/README.md), [model guide](model/README.md), [API contract](API_CONTRACT.md), and [workflow specification](FLOW.md) for further details.

## Validation and production build

From the repository root:

~~~bash
npm --prefix frontend test
npm --prefix frontend run build
model/.venv/bin/python -m unittest discover -s model/tests -v
model/.venv/bin/python -m pip install httpx
model/.venv/bin/python -m unittest backend.test_app -v
~~~

On the original NixOS development machine, source model/local-env.sh before running Python checks if that file exists. Fresh installation across operating systems and physical GPU execution still need verification.

The frontend build writes to frontend/dist/. Vite development and preview forward `/api` to the local backend. Production hosting requires an API URL or reverse proxy, appropriate CORS, and authentication. VITE_ variables are public browser configuration, so keep secrets out of them.

Dashboard pages use `/overview`, `/employees`, `/cameras`, and `/recordings/:id` without a hash. Old `/#/...` links are migrated automatically. Production hosting must serve `frontend/dist/index.html` for unmatched page routes (SPA fallback); API routes must remain separate. `VITE_API_BASE_URL` can include a version prefix when the backend serves that prefix.
