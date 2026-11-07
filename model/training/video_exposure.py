"""Screen visible postural exposure from video-derived MURI components and motion events."""

import math


METHOD = "video_muri_component_screen_v1"
LEVELS = {1: "low", 2: "moderate", 3: "high"}
REGIONS = ("arm", "back")
MIN_CONFIDENCE = .5
METHOD_NOTE = (
    "Kategori adalah ringkasan komponen postur MURI yang diprediksi dari video, bukan probabilitas penyakit. "
    "Lengan memakai arm_height; punggung memakai nilai terbesar waist_flexion dan waist_rotation. "
    "Aturan penggabungan dan ambang kualitas merupakan aturan prototipe, bukan instrumen klinis tervalidasi. "
    "Durasi mengasumsikan tiap sampel mewakili interval sampai detik berikutnya, dipotong pada akhir video. "
    "Siklus skor = rendah → sedang/tinggi → rendah; data hilang memutus siklus. "
    "Hitungan bukan jumlah genggaman/angkatan dan tidak dikonversi menjadi probabilitas MSD. "
    "Titik hilang tidak diisi; intervalnya tidak dianggap paparan rendah."
)


def finite_number(value, name):
    if isinstance(value, bool):
        raise ValueError(f"{name} must be numeric")
    number = float(value)
    if not math.isfinite(number):
        raise ValueError(f"{name} must be finite")
    return number


def visible(row, name):
    values = [row.get(name + suffix) for suffix in ("_x_px", "_y_px", "_confidence")]
    if any(value is None or value == "" for value in values):
        return False
    x, y, confidence = [finite_number(value, name) for value in values]
    if not 0 <= confidence <= 1:
        raise ValueError("Joint confidence must be in 0..1")
    return x >= 0 and y >= 0 and confidence >= MIN_CONFIDENCE


def component_scores(row):
    if row.get("status") not in ("ok", "pose_unavailable"):
        raise ValueError("Unknown pose status")
    if row["status"] != "ok":
        return {region: {"score": None, "status": "pose_unavailable"} for region in REGIONS}
    scores = {}
    for name in ("arm_height", "waist_flexion", "waist_rotation"):
        score = finite_number(row[name], name)
        if score not in (1, 2, 3):
            raise ValueError("MURI components must be 1, 2 or 3")
        scores[name] = int(score)
    arm_sides = [side for side in ("left", "right")
                 if all(visible(row, f"{side}_{joint}") for joint in ("shoulder", "elbow", "wrist"))]
    back_visible = all(visible(row, f"{side}_{joint}")
                       for side in ("left", "right") for joint in ("shoulder", "hip"))
    return {
        "arm": {"score": scores["arm_height"] if arm_sides else None,
                "status": "observed" if arm_sides else "joints_unavailable", "visible_sides": arm_sides},
        "back": {"score": max(scores["waist_flexion"], scores["waist_rotation"]) if back_visible else None,
                 "status": "observed" if back_visible else "joints_unavailable"},
    }


def posture_cycles(posture_rows):
    """Count complete low → elevated → low bouts, independently per visible region."""
    state = dict.fromkeys(REGIONS)
    counts = dict.fromkeys(REGIONS, 0)
    previous = None
    output = []
    for raw in posture_rows:
        timestamp = finite_number(raw["timestamp_s"], "timestamp_s")
        if timestamp < 0 or (previous is not None and timestamp <= previous):
            raise ValueError("Posture timestamps must increase")
        if previous is not None and timestamp - previous != 1:
            state = dict.fromkeys(REGIONS)
        previous = timestamp
        components = component_scores(raw)
        row = {}
        for region in REGIONS:
            score = components[region]["score"]
            completed = score == 1 and state[region] == "elevated"
            counts[region] += int(completed)
            if score is None:
                state[region] = None
            elif score == 1:
                state[region] = "low"
            elif state[region] == "low":
                state[region] = "elevated"
            # shortcut: raw 1 Hz score transitions can count prediction jitter; validate before adding debounce.
            row[f"{region}_posture_cycle_completed"] = int(completed)
            row[f"{region}_posture_cycles_so_far"] = counts[region]
        output.append(row)
    return output


def screen(posture_rows, arm_rows, events, duration_s):
    """Produce causal per-second categories; duration values are explicitly sample-based estimates."""
    duration_s = finite_number(duration_s, "duration_s")
    if duration_s <= 0:
        raise ValueError("Positive video duration required")
    expected = math.ceil(duration_s)
    if len(posture_rows) != expected:
        raise ValueError("Full-video posture grid required; keep unavailable rows instead of dropping them")
    for second, row in enumerate(posture_rows):
        if finite_number(row["timestamp_s"], "timestamp_s") != second:
            raise ValueError("Posture timestamps must cover the video on the 0,1,2,... second grid")
    last = -1
    for row in arm_rows:
        stamp = finite_number(row["timestamp_s"], "arm timestamp")
        if not last < stamp < duration_s or stamp < 0:
            raise ValueError("Motion timestamps must increase within video duration")
        last = stamp
        for side in ("left", "right"):
            value = row.get(side + "_angle_deg")
            if value not in (None, "") and not 0 <= finite_number(value, "angle") <= 180:
                raise ValueError("Motion angle must be in 0..180")
    parsed_events = []
    for event in events:
        start, end = finite_number(event["start_s"], "start_s"), finite_number(event["end_s"], "end_s")
        if event["side"] not in ("left", "right") or not 0 <= start < end < duration_s:
            raise ValueError("Motion candidate must be within the source video")
        parsed_events.append({"start_s": start, "end_s": end, "side": event["side"]})

    totals = {region: {"valid_duration_estimate_s": 0.0, "elevated_duration_estimate_s": 0.0,
                       "high_duration_estimate_s": 0.0, "longest_elevated_run_estimate_s": 0.0,
                       "valid_samples": 0, "level_samples": {level: 0 for level in LEVELS.values()}}
              for region in REGIONS}
    run = dict.fromkeys(REGIONS, 0.0)
    history = {region: [] for region in REGIONS}
    cycles = posture_cycles(posture_rows)
    output = []
    for second, raw in enumerate(posture_rows):
        weight = min(1.0, duration_s - second)
        components = component_scores(raw)
        row = {"timestamp_s": second, "data_origin": "recorded_video", "method": METHOD,
               "assessment_scope": "visible_postural_components", "pose_status": raw["status"],
               "sample_interval_s": weight, "window_samples": min(30, second + 1)}
        for region in REGIONS:
            value = components[region]
            score, stats = value["score"], totals[region]
            level = LEVELS.get(score)
            history[region].append((score, weight))
            if score is not None:
                stats["valid_duration_estimate_s"] += weight
                stats["valid_samples"] += 1
                stats["level_samples"][level] += 1
            if score is not None and score >= 2:
                stats["elevated_duration_estimate_s"] += weight
                stats["high_duration_estimate_s"] += weight if score == 3 else 0
                run[region] += weight
                stats["longest_elevated_run_estimate_s"] = max(stats["longest_elevated_run_estimate_s"], run[region])
            else:
                run[region] = 0.0
            window = history[region][-30:]
            valid_window = sum(s is not None for s, _ in window)
            elevated_window = sum(s is not None and s >= 2 for s, _ in window)
            row.update({f"{region}_level": level, f"{region}_score": score, f"{region}_status": value["status"],
                        f"{region}_valid_samples_30": valid_window,
                        f"{region}_elevated_samples_30": elevated_window,
                        f"{region}_elevated_fraction_30": elevated_window / valid_window if valid_window else None,
                        f"{region}_coverage_30": valid_window / len(window),
                        f"{region}_valid_duration_estimate_s": round(stats["valid_duration_estimate_s"], 6),
                        f"{region}_elevated_duration_estimate_s": round(stats["elevated_duration_estimate_s"], 6),
                        f"{region}_high_duration_estimate_s": round(stats["high_duration_estimate_s"], 6),
                        f"{region}_elevated_run_estimate_s": round(run[region], 6)})
        row.update(cycles[second])
        row["arm_visible_sides"] = ",".join(components["arm"].get("visible_sides", []))
        # Motion counts stay separate: elbow cycles are not hand exertions or lifts.
        row["motion_window_s"] = min(30, second)
        start = max(0, second - 30)
        sampled = [r for r in arm_rows if start <= float(r["timestamp_s"]) <= second]
        for side in ("left", "right"):
            valid = sum(r.get(side + "_angle_deg") not in (None, "") for r in sampled)
            row[f"{side}_motion_coverage_30"] = valid / len(sampled) if sampled else None
            row[f"{side}_candidate_cycles_30"] = sum(e["side"] == side and start < e["end_s"] <= second for e in parsed_events)
            row[f"{side}_candidate_cycles_so_far"] = sum(e["side"] == side and e["end_s"] <= second for e in parsed_events)
        output.append(row)
    for region, stats in totals.items():
        stats["posture_cycles"] = cycles[-1][f"{region}_posture_cycles_so_far"]
        valid = stats["valid_duration_estimate_s"]
        stats["coverage"] = valid / duration_s
        stats["elevated_fraction_of_valid"] = stats["elevated_duration_estimate_s"] / valid if valid else None
    summary = {"method": METHOD, "data_origin": "recorded_video", "assessment_scope": "visible_postural_components",
               "duration_s": duration_s, "samples": len(output), "regions": totals,
               "minimum_joint_confidence": MIN_CONFIDENCE, "prototype": True, "clinically_validated": False,
               "clinical_cts_risk": None, "clinical_low_back_pain_risk": None,
               "unmeasured": ["grip_force", "load_mass", "wrist_and_finger_posture", "shift_exposure_duration"],
               "note": METHOD_NOTE,
               "sources": ["https://zenodo.org/records/7043787",
                           "https://www.cdc.gov/niosh/ergonomics/ergo-programs/risk-factors.html"]}
    return output, summary
