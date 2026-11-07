"""Prototype ergonomic exposure assessment; no disease probabilities or diagnoses."""

import argparse
import bisect
import csv
import json
import math
import re
from collections import Counter
from pathlib import Path


POSTURES = ("waist_flexion", "waist_rotation", "arm_height", "knee_flexion")
CTS_METHOD = "HAL_2018_exposure"
BACK_METHOD = "RNLE_2021_single_task"
SOURCES = {
    CTS_METHOD: "https://stacks.cdc.gov/view/cdc/97295",
    BACK_METHOD: "https://stacks.cdc.gov/view/cdc/110725",
}
LIMITATIONS = [
    "Prototipe penilaian paparan ergonomi; tidak menghasilkan diagnosis atau probabilitas CTS/LBP.",
    "HAL/gaya dan pengukuran RNLE berasal dari metadata tugas, bukan prediksi video.",
    "Penilaian tugas diulang pada baris waktunya; perubahan per detik hanya berlaku pada pengamatan postur.",
    "RNLE hanya untuk tugas angkat dua tangan yang memenuhi syarat; tidak mencakup seluruh risiko punggung.",
    "Skor MURI masih eksperimental. Satu sampel per detik dapat melewatkan gerakan singkat.",
    "Sampel yang hilang tidak berarti paparan rendah. Persentase postur memakai sampel valid sebagai penyebut.",
    "Contoh sintetis menguji perhitungan; hasilnya tidak mengukur akurasi pada pekerja nyata.",
]
# NIOSH 2021 manual, Table 5, p. 15: columns short/moderate/long, each V<75 / V>=75 cm.
FREQUENCIES = (.2, .5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15)
FM = (
    (1, 1, .95, .95, .85, .85), (.97, .97, .92, .92, .81, .81),
    (.94, .94, .88, .88, .75, .75), (.91, .91, .84, .84, .65, .65),
    (.88, .88, .79, .79, .55, .55), (.84, .84, .72, .72, .45, .45),
    (.80, .80, .60, .60, .35, .35), (.75, .75, .50, .50, .27, .27),
    (.70, .70, .42, .42, .22, .22), (.60, .60, .35, .35, .18, .18),
    (.52, .52, .30, .30, 0, .15), (.45, .45, .26, .26, 0, .13),
    (.41, .41, 0, .23, 0, 0), (.37, .37, 0, .21, 0, 0),
    (0, .34, 0, 0, 0, 0), (0, .31, 0, 0, 0, 0), (0, .28, 0, 0, 0, 0),
)
CTS_FIELDS = ("applicable", "hal", "normalized_peak_force", "task_hours_per_day")
BACK_FIELDS = ("applicable", "load_kg", "origin_h_cm", "origin_v_cm", "origin_asymmetry_deg",
               "destination_v_cm", "destination_control", "frequency_per_min", "duration_category", "coupling")
BACK_DEST_FIELDS = ("destination_h_cm", "destination_asymmetry_deg")


def number(value, name, lower=0, upper=math.inf):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{name}: expected a finite number")
    if not lower <= value <= upper:
        raise ValueError(f"{name}: expected {lower} <= value <= {upper}")
    return float(value)


def keys(data, allowed, name):
    if not isinstance(data, dict) or set(data) - set(allowed):
        raise ValueError(f"{name}: expected an object with only {', '.join(allowed)}")


def result(method, status="insufficient_data", reason="", **values):
    return {"method": method, "status": status, "category": None, "index": None,
            "reason": reason, **values}


def readiness(data, fields, method):
    if data.get("applicable") is not None and type(data["applicable"]) is not bool:
        raise ValueError("applicable must be true, false or null")
    if data.get("applicable") is False:
        return result(method, "not_applicable", "Metode tidak sesuai dengan tugas ini")
    missing = [field for field in fields if data.get(field) is None]
    if missing:
        return result(method, reason="Input belum tersedia: " + ", ".join(missing), missing=missing)
    return None


def at_least(value, threshold):
    return value >= threshold or math.isclose(value, threshold, rel_tol=1e-12, abs_tol=1e-12)


def assess_cts(data):
    keys(data, CTS_FIELDS, "cts hand")
    unavailable = readiness(data, CTS_FIELDS, CTS_METHOD)
    if unavailable:
        return unavailable
    hal = number(data["hal"], "hal", 0, 10)
    force = number(data["normalized_peak_force"], "normalized_peak_force", 0, 10)
    hours = number(data["task_hours_per_day"], "task_hours_per_day", 0, 24)
    # shortcut: single repetitive task lasting 4-8 h/day; extend after expert multi-task assessment.
    if not 4 <= hours <= 8:
        return result(CTS_METHOD, "outside_scope", "Prototipe HAL mendukung tugas repetitif 4-8 jam/hari")
    tlv, al = .56 * (10 - hal), .56 * (10 - hal) - 2
    category = ("at_or_above_tlv" if at_least(force, tlv) else
                "at_or_above_action_limit" if at_least(force, al) else "below_action_limit")
    return result(CTS_METHOD, "assessed", "Perbandingan HAL dan gaya dari metadata tugas",
                  category=category, index=force / tlv if tlv > 0 else None,
                  hal=hal, normalized_peak_force=force, action_limit=al, tlv=tlv)


def frequency_multiplier(frequency, origin_v, duration):
    number(frequency, "frequency_per_min")
    number(origin_v, "origin_v_cm")
    if duration not in ("short", "moderate", "long"):
        raise ValueError("duration_category must be short, moderate or long")
    if frequency > 15:
        return 0.0
    column = 2 * ("short", "moderate", "long").index(duration) + (origin_v >= 75)
    if frequency <= .2:
        return FM[0][column]
    hi = bisect.bisect_left(FREQUENCIES, frequency)
    lo = hi - 1
    ratio = (frequency - FREQUENCIES[lo]) / (FREQUENCIES[hi] - FREQUENCIES[lo])
    return FM[lo][column] + ratio * (FM[hi][column] - FM[lo][column])


def assess_back(data):
    keys(data, (*BACK_FIELDS, *BACK_DEST_FIELDS), "low_back")
    unavailable = readiness(data, BACK_FIELDS, BACK_METHOD)
    if unavailable:
        return unavailable
    if type(data["destination_control"]) is not bool:
        raise ValueError("destination_control must be true or false")
    if data["destination_control"]:
        unavailable = readiness(data, BACK_DEST_FIELDS, BACK_METHOD)
        if unavailable:
            return unavailable
    if data["coupling"] not in ("good", "fair", "poor"):
        raise ValueError("coupling must be good, fair or poor")
    for field in ("load_kg", "origin_h_cm", "origin_v_cm", "origin_asymmetry_deg",
                  "destination_v_cm", "frequency_per_min", *BACK_DEST_FIELDS):
        if data.get(field) is not None:
            number(data[field], field)
    if data["load_kg"] == 0 or data["frequency_per_min"] == 0:
        return result(BACK_METHOD, "not_applicable", "RNLE membutuhkan beban dan frekuensi angkat positif")
    travel = abs(data["destination_v_cm"] - data["origin_v_cm"])
    if travel == 0:
        return result(BACK_METHOD, "outside_scope", "Tidak ada perpindahan vertikal; tinjau jenis tugas")
    fm = frequency_multiplier(data["frequency_per_min"], data["origin_v_cm"], data["duration_category"])
    endpoints = ("origin", "destination") if data["destination_control"] else ("origin",)
    rwls, multipliers = {}, {}
    for endpoint in endpoints:
        h, v, a = (data[f"{endpoint}_{field}"] for field in ("h_cm", "v_cm", "asymmetry_deg"))
        if h > 63 or v > 175 or a > 135 or travel > 175 or data["destination_v_cm"] > 175:
            return result(BACK_METHOD, "outside_scope", "Geometri di luar rentang RNLE; perlu penilaian ergonomi")
        cm = {"good": 1, "fair": .95 if v < 75 else 1, "poor": .90}[data["coupling"]]
        factors = {"HM": 25 / max(h, 25), "VM": 1 - .003 * abs(v - 75),
                   "DM": .82 + 4.5 / max(travel, 25), "AM": 1 - .0032 * a, "FM": fm, "CM": cm}
        multipliers[endpoint] = factors
        rwls[endpoint] = 23 * math.prod(factors.values())
    rwl = min(rwls.values())
    if rwl == 0:
        return result(BACK_METHOD, "assessed", "Frekuensi melampaui batas tabel; RWL nol dan LI tidak terhingga",
                      category="zero_recommended_weight_limit", rwl_kg=0, multipliers=multipliers)
    li = data["load_kg"] / rwl
    category = "above_3" if li > 3 else "above_1" if li > 1 else "at_or_below_1"
    return result(BACK_METHOD, "assessed", "Indeks angkat tugas dari pengukuran RNLE",
                  category=category, index=li, rwl_kg=rwl, endpoint_rwl_kg=rwls, multipliers=multipliers)


def read_tasks(path):
    if path is None:
        return {"schema_version": 1, "data_origin": "unknown", "note": "Belum ada pengukuran tugas", "tasks": []}
    config = json.loads(Path(path).read_text(encoding="utf-8"))
    keys(config, ("schema_version", "data_origin", "note", "tasks"), "task config")
    if type(config.get("schema_version")) is not int or config["schema_version"] != 1:
        raise ValueError("Expected schema_version 1")
    if config.get("data_origin") not in ("synthetic", "external_assessment", "unknown"):
        raise ValueError("data_origin must be synthetic, external_assessment or unknown")
    if not isinstance(config.get("note"), str) or not config["note"].strip():
        raise ValueError("Provide a note describing where the task inputs came from")
    if not isinstance(config.get("tasks"), list):
        raise ValueError("tasks must be a list")
    previous_end, ids = -1, set()
    for task in config["tasks"]:
        keys(task, ("id", "start_s", "end_s", "cts", "low_back"), "task")
        identity = task.get("id", "")
        if not isinstance(identity, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", identity) or identity in ids:
            raise ValueError("Task IDs must be unique, with 1-64 letters, digits, underscores or hyphens")
        ids.add(identity)
        start, end = (number(task.get(name), name) for name in ("start_s", "end_s"))
        if end <= start or start < previous_end:
            raise ValueError("Task intervals must be sorted, positive and non-overlapping")
        previous_end = end
        hands = task.get("cts", {})
        keys(hands, ("left", "right"), "cts")
        assessments = {"cts_" + side: assess_cts(hands.get(side, {})) for side in ("left", "right")}
        assessments["low_back"] = assess_back(task.get("low_back", {}))
        if config["data_origin"] == "unknown" and any(r["status"] == "assessed" for r in assessments.values()):
            raise ValueError("Assessed results require synthetic or external_assessment provenance")
    return config


def read_observations(path):
    observations = []
    with Path(path).open(encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        required = {"timestamp_s", "status", *POSTURES}
        if not reader.fieldnames or not required <= set(reader.fieldnames) or len(set(reader.fieldnames)) != len(reader.fieldnames):
            raise ValueError("Expected unique headers, timestamp_s, status and all four MURI columns")
        for line, raw in enumerate(reader, 2):
            if None in raw or any(raw[field] is None for field in required):
                raise ValueError(f"CSV line {line}: wrong number of fields")
            timestamp = number(float(raw["timestamp_s"]), "timestamp_s")
            if observations:
                delta = timestamp - observations[-1]["timestamp_s"]
                if delta < 1 - 1e-5 or not math.isclose(delta, round(delta), abs_tol=1e-5):
                    raise ValueError("Expected increasing per-second samples; duplicate/fractional intervals are unsupported")
            status = raw["status"]
            if status not in ("ok", "pose_unavailable"):
                raise ValueError(f"CSV line {line}: unexpected pose status")
            origin = raw.get("data_origin", "recorded_video")
            if origin not in ("recorded_video", "synthetic"):
                raise ValueError("Observation data_origin must be recorded_video or synthetic")
            row = {"timestamp_s": timestamp, "pose_status": status, "observation_origin": origin}
            for posture in POSTURES:
                value = raw[posture]
                if status == "ok":
                    if value not in ("1", "2", "3"):
                        raise ValueError(f"CSV line {line}: expected MURI score 1, 2 or 3")
                    row[posture] = int(value)
                else:
                    if value != "":
                        raise ValueError("Unavailable pose must have blank scores; stale scores are unsafe")
                    row[posture] = None
            observations.append(row)
    if not observations:
        raise ValueError("CSV contains no observations")
    if len({r["observation_origin"] for r in observations}) != 1:
        raise ValueError("Do not mix synthetic and recorded observations in one CSV")
    return observations


def build_report(observations, config, model=None):
    task_results = []
    for task in config["tasks"]:
        hands = task.get("cts", {})
        task_results.append({"id": task["id"], "start_s": task["start_s"], "end_s": task["end_s"],
                             "cts_left": assess_cts(hands.get("left", {})),
                             "cts_right": assess_cts(hands.get("right", {})),
                             "low_back": assess_back(task.get("low_back", {}))})
        if model is not None:
            from risk_ml import predict

            for name in ("cts_left", "cts_right", "low_back"):
                data = task.get("low_back", {}) if name == "low_back" else hands.get(name.removeprefix("cts_"), {})
                task_results[-1][name]["ml"] = predict(model, "low_back" if name == "low_back" else "cts",
                                                       data, task_results[-1][name])
    default = {"id": "", "cts_left": assess_cts({}), "cts_right": assess_cts({}), "low_back": assess_back({})}
    if model is not None:
        for name in ("cts_left", "cts_right", "low_back"):
            default[name]["ml"] = {"status": "insufficient_data", "category": None, "reason": default[name]["reason"]}
    valid, elevated, rows, cursor = 0, Counter(), [], 0
    for observation in observations:
        timestamp = observation["timestamp_s"]
        while cursor < len(task_results) and timestamp >= task_results[cursor]["end_s"]:
            cursor += 1
        task = task_results[cursor] if cursor < len(task_results) and timestamp >= task_results[cursor]["start_s"] else default
        valid += observation["pose_status"] == "ok"
        row = {**observation, "task_id": task["id"], "exposure_input_origin": config["data_origin"],
               "assessment_scope": "task_metadata", "valid_pose_samples_so_far": valid}
        for posture in POSTURES:
            elevated[posture] += observation[posture] is not None and observation[posture] >= 2
            row[posture + "_ge2_fraction_so_far"] = elevated[posture] / valid if valid else None
        for name in ("cts_left", "cts_right", "low_back"):
            assessment = task[name]
            for field in ("method", "status", "category", "index", "reason"):
                row[name + "_" + field] = assessment[field]
            if model is not None:
                for field in ("status", "category", "reason"):
                    row[name + "_ml_" + field] = assessment["ml"][field]
        row["low_back_rwl_kg"] = task["low_back"].get("rwl_kg")
        rows.append(row)
    expected = round(observations[-1]["timestamp_s"] - observations[0]["timestamp_s"]) + 1
    summary = {"schema_version": 1, "prototype": True,
               "synthetic": config["data_origin"] == "synthetic" or observations[0]["observation_origin"] == "synthetic",
               "observation_origin": observations[0]["observation_origin"],
               "expected_samples": expected, "observed_samples": len(rows), "valid_pose_samples": valid,
               "pose_coverage": valid / expected, "missing_rows": expected - len(rows),
               "posture_ge2_fraction_of_valid_samples": {p: elevated[p] / valid if valid else None for p in POSTURES},
               "assessment_status_counts": {name: dict(Counter(r[name + "_status"] for r in rows))
                                            for name in ("cts_left", "cts_right", "low_back")},
               "task_inputs": config, "task_assessments": task_results, "sources": SOURCES, "limitations": LIMITATIONS}
    if model is not None:
        summary["ml_model"] = {key: model[key] for key in ("format", "training_origin", "selected", "note", "split_sizes")}
        summary["limitations"] = [*LIMITATIONS, model["note"]]
    return rows, summary


def write_csv(path, rows):
    with Path(path).open("x", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def write_report(observations_path, output, tasks_path=None, model_path=None):
    output = Path(output)
    if output.exists():
        raise FileExistsError(f"Choose a new output directory: {output}")
    config = read_tasks(tasks_path)
    observations = read_observations(observations_path)
    model = None
    if model_path is not None:
        from risk_ml import load_model

        model = load_model(model_path)
    rows, summary = build_report(observations, config, model)
    if model_path is not None:
        import hashlib

        summary["ml_model"]["sha256"] = hashlib.sha256(Path(model_path).read_bytes()).hexdigest()
    from openpyxl import Workbook

    output.mkdir(parents=True, exist_ok=False)
    write_csv(output / "risk_per_second.csv", rows)
    (output / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False, allow_nan=False) + "\n")
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Per_second"
    sheet.append(list(rows[0]))
    for row in rows:
        sheet.append(list(row.values()))
    sheet.freeze_panes = "C2"
    sheet.auto_filter.ref = sheet.dimensions
    for column in sheet.columns:
        sheet.column_dimensions[column[0].column_letter].width = min(45, max(16, len(str(column[0].value)) + 2))
    inputs = workbook.create_sheet("Task_inputs")
    inputs.append(["Data origin", config["data_origin"]])
    inputs.append(["Source note", config["note"]])
    for task in config["tasks"]:
        inputs.append([task["id"], json.dumps(task, ensure_ascii=False)])
    for row in inputs:
        for cell in row:
            if isinstance(cell.value, str):
                cell.data_type = "s"
    notes = workbook.create_sheet("ReadMe")
    notes.append(["SYNTHETIC DEMO" if summary["synthetic"] else "VIDEO NYATA: PROTOTIPE PAPARAN ERGONOMI"])
    for note in summary["limitations"]:
        notes.append([note])
    for method, url in SOURCES.items():
        notes.append([method, url])
    workbook.save(output / "risk_per_second.xlsx")
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    assess = sub.add_parser("assess", help="Join per-second MURI observations with external task assessments")
    assess.add_argument("observations", type=Path)
    assess.add_argument("output", type=Path)
    assess.add_argument("--tasks", type=Path, help="JSON with absolute video-time intervals and measured or synthetic inputs")
    assess.add_argument("--model", type=Path, help="Optional trusted risk_model.joblib trained on synthetic task inputs")
    demo = sub.add_parser("demo", help="Create labelled synthetic scenarios and a separate per-second demonstration")
    demo.add_argument("output", type=Path)
    args = parser.parse_args()
    if args.command == "demo":
        from risk_demo import generate

        generate(args.output)
    else:
        summary = write_report(args.observations, args.output, args.tasks, args.model)
        print(json.dumps({k: summary[k] for k in ("synthetic", "observed_samples", "pose_coverage", "assessment_status_counts")}, indent=2))
    print(f"Results: {args.output}")


if __name__ == "__main__":
    main()
