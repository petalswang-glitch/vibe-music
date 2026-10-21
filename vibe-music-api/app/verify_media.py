"""Verify the synthetic fixture through a running API or same-origin Next proxy."""

import argparse
import hashlib
import json
from pathlib import Path

import httpx

from app.seed_media import DEMO_KEY, demo_audio


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:18000")
    parser.add_argument("--report", default=".cache/media-verification.json")
    args = parser.parse_args()
    expected = demo_audio()
    path = f"/media/{DEMO_KEY}"
    checks = {}
    with httpx.Client(base_url=args.base_url, timeout=20, trust_env=False) as client:
        full = client.get(path)
        assert full.status_code == 200 and full.content == expected, "Full audio differs"
        assert full.headers["content-type"].startswith("audio/wav"), "Wrong content type"
        checks["full_sha256"] = hashlib.sha256(full.content).hexdigest()
        head = client.head(path)
        assert head.status_code == 200 and not head.content, "HEAD must not return a body"
        assert int(head.headers["content-length"]) == len(expected), "HEAD size differs"
        checks["head"] = True
        for label, value, start, end in [
            ("prefix", "bytes=0-43", 0, 43),
            ("middle", "bytes=8000-15999", 8000, 15999),
            ("suffix", "bytes=-64", len(expected) - 64, len(expected) - 1),
        ]:
            part = client.get(path, headers={"range": value})
            assert part.status_code == 206 and part.content == expected[start : end + 1], label
            assert part.headers["content-range"] == f"bytes {start}-{end}/{len(expected)}", label
            checks[label] = True
        invalid = client.get(path, headers={"range": f"bytes={len(expected) + 1}-"})
        assert invalid.status_code == 416, "Unsatisfiable range must return 416"
        assert invalid.headers["content-range"] == f"bytes */{len(expected)}"
        checks["unsatisfiable_range"] = True
        etag = full.headers["etag"]
        cached = client.get(path, headers={"if-none-match": etag})
        assert cached.status_code == 304 and not cached.content, "ETag cache validation failed"
        checks["cache_validation"] = True
        changed = client.get(path, headers={"range": "bytes=0-43", "if-range": '"outdated"'})
        assert changed.status_code == 200 and changed.content == expected, (
            "If-Range fallback failed"
        )
        checks["if_range_fallback"] = True
        missing = client.get("/media/__demo__/missing-file.wav")
        assert missing.status_code == 404, "Missing object must return 404"
        checks["missing_object"] = True
    report = Path(args.report)
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(
        json.dumps(
            {"base_url": args.base_url, "fixture": path, "checks": checks},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Media verification passed: {report}")


if __name__ == "__main__":
    main()
