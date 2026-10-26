#!/usr/bin/env python3
"""Export every completed FastF1 session for one or more seasons."""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone

import fastf1
import pandas as pd

from export_sessions import CACHE_DIR, DATA_DIR, export_session, write_export


SESSION_CODES = {
    "Practice 1": "FP1",
    "Practice 2": "FP2",
    "Practice 3": "FP3",
    "Qualifying": "Q",
    "Sprint": "S",
    "Sprint Shootout": "SS",
    "Sprint Qualifying": "SQ",
    "Race": "R",
}


def completed_sessions(year: int):
    schedule = fastf1.get_event_schedule(year, include_testing=False)
    now = pd.Timestamp.now(tz="UTC")
    for _, event in schedule.iterrows():
        round_number = int(event.get("RoundNumber") or 0)
        if round_number <= 0:
            continue
        for index in range(1, 6):
            name = str(event.get(f"Session{index}") or "").strip()
            code = SESSION_CODES.get(name)
            date = event.get(f"Session{index}DateUtc")
            if not code or pd.isna(date):
                continue
            timestamp = pd.Timestamp(date)
            if timestamp.tzinfo is None:
                timestamp = timestamp.tz_localize("UTC")
            if timestamp <= now:
                yield round_number, str(event.get("EventName")), code


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start-year", type=int, default=2018)
    parser.add_argument("--end-year", type=int, default=datetime.now().year)
    parser.add_argument("--continue-on-error", action="store_true")
    args = parser.parse_args()

    if not os.getenv("F1_USERNAME") or not os.getenv("F1_PASSWORD"):
        raise SystemExit("F1_USERNAME and F1_PASSWORD are required by FastF1 3.9")

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    fastf1.Cache.configure(cache_dir=str(CACHE_DIR))
    manifest_path = DATA_DIR / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {"sessions": []}

    failures = []
    for year in range(args.start_year, args.end_year + 1):
        for round_number, event_name, code in completed_sessions(year):
            try:
                slug, payload = export_session(year, round_number, code)
                manifest["generatedAt"] = datetime.now(timezone.utc).isoformat()
                write_export(manifest, slug, payload)
            except Exception as exc:
                failures.append(f"{year} {event_name} {code}: {exc}")
                print(f"FAILED {failures[-1]}")
                if not args.continue_on_error:
                    raise

    if failures:
        print("\nSessions not exported:")
        print("\n".join(failures))
        raise SystemExit(2)


if __name__ == "__main__":
    main()
