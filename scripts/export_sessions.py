#!/usr/bin/env python3
"""Export compact, browser-friendly FastF1 session data."""

from __future__ import annotations

import argparse
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import fastf1
import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
CACHE_DIR = ROOT / ".cache" / "fastf1"


def clean(value: Any) -> Any:
    if value is None or value is pd.NaT:
        return None
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        return None if math.isnan(float(value)) else round(float(value), 4)
    if isinstance(value, (np.bool_, bool)):
        return bool(value)
    if isinstance(value, pd.Timedelta):
        return None if pd.isna(value) else round(value.total_seconds(), 4)
    if isinstance(value, pd.Timestamp):
        return None if pd.isna(value) else value.isoformat()
    if pd.isna(value):
        return None
    return value


def seconds(value: Any) -> float | None:
    if value is None or pd.isna(value):
        return None
    if hasattr(value, "total_seconds"):
        return round(float(value.total_seconds()), 4)
    return clean(value)


def lap_label(value: Any) -> str:
    total = seconds(value)
    if total is None:
        return "—"
    minutes = int(total // 60)
    return f"{minutes}:{total - minutes * 60:06.3f}"


def sample_frame(frame: pd.DataFrame, maximum: int = 260) -> pd.DataFrame:
    if len(frame) <= maximum:
        return frame
    indexes = np.linspace(0, len(frame) - 1, maximum).round().astype(int)
    return frame.iloc[np.unique(indexes)]


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def color(value: Any, fallback: str = "6ce5e8") -> str:
    raw = str(value or fallback).strip().lstrip("#")
    return f"#{raw}" if re.fullmatch(r"[0-9A-Fa-f]{6}", raw) else f"#{fallback}"


def export_driver(session: fastf1.core.Session, abbreviation: str, result: pd.Series) -> dict[str, Any]:
    laps = session.laps.pick_drivers(abbreviation)
    accurate = laps[laps["LapTime"].notna()].copy()
    fastest = accurate.pick_fastest() if not accurate.empty else None

    lap_rows = []
    for _, lap in accurate.iterrows():
        lap_rows.append({
            "lap": clean(lap.get("LapNumber")),
            "time": seconds(lap.get("LapTime")),
            "label": lap_label(lap.get("LapTime")),
            "compound": str(lap.get("Compound") or "UNKNOWN"),
            "stint": clean(lap.get("Stint")),
            "tyreLife": clean(lap.get("TyreLife")),
            "freshTyre": clean(lap.get("FreshTyre")),
            "personalBest": clean(lap.get("IsPersonalBest")),
            "trackStatus": str(lap.get("TrackStatus") or ""),
        })

    telemetry: dict[str, list[Any]] = {
        key: [] for key in ("distance", "speed", "throttle", "brake", "gear", "drs", "rpm", "x", "y")
    }
    if fastest is not None:
        try:
            tel = sample_frame(fastest.get_telemetry())
            mapping = {
                "distance": "Distance", "speed": "Speed", "throttle": "Throttle",
                "brake": "Brake", "gear": "nGear", "drs": "DRS", "rpm": "RPM",
                "x": "X", "y": "Y",
            }
            for target, source in mapping.items():
                if source in tel:
                    telemetry[target] = [clean(value) for value in tel[source].tolist()]
        except Exception as exc:  # a missing channel should not block the session export
            print(f"Telemetry unavailable for {abbreviation}: {exc}")

    stint_rows = []
    if not accurate.empty and "Stint" in accurate:
        for stint, group in accurate.groupby("Stint", dropna=True):
            stint_rows.append({
                "stint": clean(stint),
                "compound": str(group["Compound"].dropna().iloc[0]) if group["Compound"].notna().any() else "UNKNOWN",
                "startLap": clean(group["LapNumber"].min()),
                "endLap": clean(group["LapNumber"].max()),
                "laps": int(len(group)),
            })

    lap_times = [row["time"] for row in lap_rows if row["time"]]
    top_speed = max(telemetry["speed"], default=None)
    return {
        "abbreviation": abbreviation,
        "fullName": str(result.get("FullName") or result.get("BroadcastName") or abbreviation),
        "team": str(result.get("TeamName") or "—"),
        "color": color(result.get("TeamColor")),
        "number": str(result.get("DriverNumber") or ""),
        "position": clean(result.get("Position")),
        "classifiedPosition": str(result.get("ClassifiedPosition") or "—"),
        "status": str(result.get("Status") or "—"),
        "points": clean(result.get("Points")),
        "bestLap": lap_label(fastest.get("LapTime") if fastest is not None else None),
        "bestLapSeconds": seconds(fastest.get("LapTime") if fastest is not None else None),
        "medianLapSeconds": round(float(np.median(lap_times)), 4) if lap_times else None,
        "topSpeed": round(float(top_speed), 1) if top_speed is not None else None,
        "lapCount": len(lap_rows),
        "laps": lap_rows,
        "stints": stint_rows,
        "telemetry": telemetry,
    }


def export_session(year: int, event: str | int, session_code: str) -> tuple[str, dict[str, Any]]:
    print(f"Loading {year} {event} {session_code}...")
    session = fastf1.get_session(year, event, session_code)
    session.load(telemetry=True, weather=True, messages=True)

    results = session.results.sort_values("Position", na_position="last")
    drivers: dict[str, Any] = {}
    ranking = []
    for _, result in results.iterrows():
        abbreviation = str(result.get("Abbreviation") or "").strip()
        if not abbreviation:
            continue
        driver = export_driver(session, abbreviation, result)
        drivers[abbreviation] = driver
        ranking.append({key: driver[key] for key in (
            "abbreviation", "fullName", "team", "color", "number", "position",
            "classifiedPosition", "status", "points", "bestLap", "bestLapSeconds"
        )})

    weather = []
    if session.weather_data is not None:
        for _, row in sample_frame(session.weather_data, 90).iterrows():
            weather.append({
                "time": seconds(row.get("Time")),
                "airTemp": clean(row.get("AirTemp")),
                "trackTemp": clean(row.get("TrackTemp")),
                "humidity": clean(row.get("Humidity")),
                "pressure": clean(row.get("Pressure")),
                "rainfall": clean(row.get("Rainfall")),
                "windSpeed": clean(row.get("WindSpeed")),
            })

    race_control = []
    if session.race_control_messages is not None:
        for _, row in session.race_control_messages.tail(80).iterrows():
            race_control.append({
                "time": seconds(row.get("Time")),
                "lap": clean(row.get("Lap")),
                "category": str(row.get("Category") or "INFO"),
                "message": str(row.get("Message") or ""),
                "flag": str(row.get("Flag") or ""),
            })

    event_name = str(session.event.get("EventName") or event)
    slug = f"{year}-{slugify(event_name)}-{session_code.lower()}"
    generated_at = datetime.now(timezone.utc).isoformat()
    source_label = (
        "FastF1 official docs snapshot"
        if "UNKNOWN" in fastf1.__version__
        else f"FastF1 {fastf1.__version__}"
    )
    payload = {
        "schemaVersion": 1,
        "meta": {
            "id": slug,
            "year": year,
            "event": event_name,
            "officialEventName": str(session.event.get("OfficialEventName") or event_name),
            "country": str(session.event.get("Country") or ""),
            "location": str(session.event.get("Location") or ""),
            "session": session_code.upper(),
            "sessionName": str(session.name),
            "date": clean(session.date),
            "generatedAt": generated_at,
            "source": source_label,
        },
        "ranking": ranking,
        "drivers": drivers,
        "weather": weather,
        "raceControl": race_control,
    }
    return slug, payload


def parse_spec(values: list[list[str]]) -> list[tuple[int, str, str]]:
    specs = []
    for parts in values:
        if len(parts) < 3:
            raise SystemExit("Each --session needs YEAR EVENT SESSION, for example: --session 2024 Monaco Q")
        specs.append((int(parts[0]), " ".join(parts[1:-1]), parts[-1].upper()))
    return specs


def write_export(manifest: dict[str, Any], slug: str, payload: dict[str, Any]) -> None:
    target = DATA_DIR / f"{slug}.json"
    target.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    manifest["sessions"] = [item for item in manifest["sessions"] if item.get("id") != slug]
    manifest["sessions"].append({
        "id": slug,
        "file": f"data/{target.name}",
        **payload["meta"],
    })
    manifest["sessions"].sort(key=lambda item: (
        int(item.get("year", 0)), str(item.get("date") or ""), str(item.get("sessionName") or "")
    ), reverse=True)
    (DATA_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Wrote {target.relative_to(ROOT)} ({target.stat().st_size / 1024:.0f} KiB)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--session", action="append", nargs="+", required=True,
        metavar="VALUE",
        help="Session to export. Repeat the option for multiple sessions.",
    )
    parser.add_argument(
        "--frozen-cache",
        help="Optional path to the official FastF1 frozen documentation HTTP cache.",
    )
    parser.add_argument(
        "--append", action="store_true",
        help="Keep existing manifest entries and replace only matching session IDs.",
    )
    args = parser.parse_args()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    if args.frozen_cache:
        from fastf1 import testing as fastf1_testing
        fastf1_testing.enable_frozen_http_cache(
            str(Path(args.frozen_cache).resolve()), str(CACHE_DIR), record=False
        )
    else:
        fastf1.Cache.configure(cache_dir=str(CACHE_DIR))

    manifest_path = DATA_DIR / "manifest.json"
    if args.append and manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["generatedAt"] = datetime.now(timezone.utc).isoformat()
    else:
        manifest = {"generatedAt": datetime.now(timezone.utc).isoformat(), "sessions": []}
    for year, event, session_code in parse_spec(args.session):
        slug, payload = export_session(year, event, session_code)
        write_export(manifest, slug, payload)


if __name__ == "__main__":
    main()

