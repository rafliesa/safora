"""Reproducible synthetic task inputs; labels describe formulas, never worker outcomes."""

import copy
import json
import random
from pathlib import Path

from risk import POSTURES, assess_back, assess_cts, write_csv, write_report


def hand(hal=2, force=.8):
    return {"applicable": True, "hal": hal, "normalized_peak_force": force, "task_hours_per_day": 4}


def lift(**changes):
    data = {"applicable": True, "load_kg": 8, "origin_h_cm": 25, "origin_v_cm": 75,
            "origin_asymmetry_deg": 0, "destination_h_cm": 25, "destination_v_cm": 100,
            "destination_asymmetry_deg": 0, "destination_control": False,
            "frequency_per_min": .2, "duration_category": "short", "coupling": "good"}
    return {**data, **changes}


def example_tasks():
    cases = [
        ("demo_lower_exposure", hand(), lift()),
        ("demo_action_needed", hand(4, 2), lift(load_kg=12, origin_h_cm=40, origin_v_cm=50,
                                               origin_asymmetry_deg=30, frequency_per_min=1,
                                               duration_category="long", coupling="fair")),
        ("demo_above_limits", hand(7, 4), lift(load_kg=20, origin_h_cm=50, origin_v_cm=30,
                                              destination_v_cm=120, origin_asymmetry_deg=60,
                                              frequency_per_min=4, duration_category="long", coupling="poor")),
        ("demo_missing_inputs", {}, {}),
        ("demo_method_not_applicable", {"applicable": False}, {"applicable": False}),
    ]
    return {"schema_version": 1, "data_origin": "synthetic",
            "note": "Semua nilai merupakan skenario buatan. Tidak ada pengukuran pekerja atau label penyakit. "
                    "Asumsi short: kerja angkat 30 menit diikuti pemulihan 30 menit.",
            "tasks": [{"id": name, "start_s": i * 30, "end_s": (i + 1) * 30,
                       "cts": {"left": copy.deepcopy(h), "right": copy.deepcopy(h)}, "low_back": b}
                      for i, (name, h, b) in enumerate(cases)]}


def scenarios(count=1000, seed=20261107):
    rng = random.Random(seed)
    for i in range(count):
        h = hand(round(rng.uniform(0, 9.8), 3), round(rng.uniform(.1, 9), 3))
        h["task_hours_per_day"] = rng.choice((4, 6, 8))
        origin = rng.randint(0, 120)
        destination = rng.randint(origin + 25, 175)
        b = lift(load_kg=round(rng.uniform(2, 30), 3), origin_h_cm=rng.randint(25, 60), origin_v_cm=origin,
                 origin_asymmetry_deg=rng.randint(0, 90), destination_h_cm=rng.randint(25, 60),
                 destination_v_cm=destination, destination_asymmetry_deg=rng.randint(0, 90),
                 destination_control=rng.choice((True, False)), frequency_per_min=rng.choice((.2, .5, 1, 2, 3, 4, 6, 8)),
                 duration_category=rng.choice(("short", "moderate", "long")), coupling=rng.choice(("good", "fair", "poor")))
        cts, back = assess_cts(h), assess_back(b)
        yield {"scenario_id": f"synthetic_{i:04d}", "data_origin": "synthetic", "label_origin": "ergonomic_formula",
               **{"cts_input_" + k: v for k, v in h.items()}, **{"back_input_" + k: v for k, v in b.items()},
               "cts_method": cts["method"], "cts_category": cts["category"], "cts_index": cts["index"],
               "low_back_method": back["method"], "low_back_category": back["category"],
               "low_back_index": back["index"], "low_back_rwl_kg": back.get("rwl_kg")}


def generate(output):
    output = Path(output)
    if output.exists():
        raise FileExistsError(f"Choose a new demo directory: {output}")
    from openpyxl import Workbook  # Check the installed export dependency before writing files.

    output.mkdir(parents=True)
    config = example_tasks()
    tasks_path = output / "synthetic_tasks.json"
    tasks_path.write_text(json.dumps(config, indent=2) + "\n")
    write_csv(output / "synthetic_scenarios.csv", list(scenarios()))
    rows = []
    for second in range(150):
        missing = second in (12, 13, 72, 73, 74)
        # Synthetic MURI values only exercise the table pipeline; they are not visual ground truth.
        score = min(second // 30 + 1, 3)
        rows.append({"timestamp_s": second, "status": "pose_unavailable" if missing else "ok",
                     "data_origin": "synthetic", **{p: None if missing else score for p in POSTURES}})
    observations = output / "synthetic_observations.csv"
    write_csv(observations, rows)
    write_report(observations, output / "assessment", tasks_path)
    (output / "README.txt").write_text(
        "SYNTHETIC DEMO\n\n"
        "1.000 skenario tabular buatan memakai seed 20261107. Label dihitung dari HAL 2018 dan RNLE.\n"
        "Contoh per detik berisi 150 sampel buatan dan lima skenario; tidak berasal dari video pekerja.\n"
        "Jadwal kerja/pemulihan diasumsikan memenuhi kategori durasi RNLE pada setiap skenario.\n"
        "Kategori penilaian tugas tetap berlaku saat pose hilang karena inputnya berasal dari metadata.\n"
        "Perintah demo tidak melatih model dan tidak menyediakan label diagnosis atau akurasi klinis.\n"
        "Rumus menghitung paparan langsung; model tambahan hanya akan meniru rumus.\n"
        "Lihat RISK.md untuk arti kolom, batas metode, dan pengukuran yang perlu diisi.\n",
        encoding="utf-8")
