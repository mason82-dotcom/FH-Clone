#!/usr/bin/env python3
"""FH2 mapping E2E driver.

Runs inside the mapping E2E compose network. It deliberately uses the real
Control-API contracts and presigned S3 URLs:
  media upload -> verified MediaAsset -> mapping job -> worker -> layer -> tile.
"""
import json
import math
import os
import sys
import time
import urllib.error
import urllib.request


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required")
    return value.rstrip("/")


PUBLIC = required("FH2_PUBLIC_URL")
INTERNAL = required("FH2_INTERNAL_URL")
MEDIA_TOKEN = required("MEDIA_INGEST_TOKEN")
OPERATOR_TOKEN = required("MAPPING_OPERATOR_TOKEN")
ASSET_ID = "mapping-e2e-source-v1"
FILE_NAME = "e2e-source.ppm"


def request(method: str, url: str, *, token: str | None = None,
            body: object | None = None, raw: bytes | None = None,
            content_type: str | None = None, timeout: float = 30):
    headers = {}
    data = raw
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    elif content_type:
        headers["Content-Type"] = content_type

    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            payload = resp.read()
            return resp.status, payload, dict(resp.headers)
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"{method} {url.split('?')[0]} -> HTTP {exc.code}: {payload[:500]}"
        ) from exc


def json_request(method: str, url: str, *, token: str | None = None,
                 body: object | None = None, timeout: float = 30):
    status, payload, _ = request(
        method, url, token=token, body=body, timeout=timeout
    )
    if not payload:
        return status, None
    return status, json.loads(payload)


def ppm_fixture() -> bytes:
    # 64x48 RGB gradient; GDAL's PNM driver reads this without extra libraries.
    width, height = 64, 48
    pixels = bytearray()
    for y in range(height):
        for x in range(width):
            pixels.extend((
                (x * 255) // (width - 1),
                (y * 255) // (height - 1),
                ((x + y) * 255) // (width + height - 2),
            ))
    return f"P6\n{width} {height}\n255\n".encode("ascii") + bytes(pixels)


def center_tile(bounds: list[float], zoom: int) -> tuple[int, int]:
    west, south, east, north = bounds
    lon = (west + east) / 2.0
    lat = max(-85.05112878, min(85.05112878, (south + north) / 2.0))
    scale = 2 ** zoom
    x = int((lon + 180.0) / 360.0 * scale)
    y = int(
        (1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi)
        / 2.0
        * scale
    )
    return (
        max(0, min(scale - 1, x)),
        max(0, min(scale - 1, y)),
    )


def main() -> None:
    _, status = json_request("GET", f"{PUBLIC}/api/mapping/status")
    assert status["persistenceEnabled"] is True
    assert status["agentApiEnabled"] is True
    assert status["objectStoreConfigured"] is True
    assert status["layerViewEnabled"] is True

    _, reservation = json_request(
        "POST",
        f"{INTERNAL}/internal/media/upload-url",
        token=MEDIA_TOKEN,
        body={"assetId": ASSET_ID, "fileName": FILE_NAME},
    )
    object_key = reservation["objectKey"]
    upload_url = reservation["uploadUrl"]

    source = ppm_fixture()
    put_status, _, _ = request(
        "PUT",
        upload_url,
        raw=source,
        content_type="image/x-portable-pixmap",
        timeout=60,
    )
    assert 200 <= put_status < 300

    asset = {
        "id": ASSET_ID,
        "objectKey": object_key,
        "fileName": FILE_NAME,
        "sensor": {
            "id": "mapping-e2e-fixture",
            "kind": "unknown",
            "confidence": "unavailable",
        },
        "capture": {"deviceId": "E2E-AIRCRAFT"},
        "profile": "GENERIC",
        "metadata": {
            "source": "mapping-e2e",
            "synthetic": True,
            "sizeBytes": len(source),
        },
    }
    _, verified = json_request(
        "POST",
        f"{INTERNAL}/internal/media/assets/verified",
        token=MEDIA_TOKEN,
        body=asset,
    )
    assert verified["accepted"] == 1
    assert verified["persisted"] is True
    assert verified["objectStoreVerified"] is True

    _, job = json_request(
        "POST",
        f"{PUBLIC}/api/mapping/jobs",
        token=OPERATOR_TOKEN,
        body={
            "name": "E2E Fake NodeODM",
            "assetIds": [ASSET_ID],
            "profile": "fast",
            "odmOptions": {
                "fast-orthophoto": True,
                "skip-3dmodel": True,
                "dsm": True,
            },
            "deviceSn": "E2E-AIRCRAFT",
        },
    )
    job_id = job["id"]
    print(f"MAPPING_E2E_JOB_ID={job_id}", flush=True)

    deadline = time.monotonic() + 240
    last = None
    while time.monotonic() < deadline:
        _, jobs = json_request(
            "GET",
            f"{PUBLIC}/api/mapping/jobs?limit=50",
            token=OPERATOR_TOKEN,
        )
        current = next((entry for entry in jobs if entry["id"] == job_id), None)
        if current is None:
            raise RuntimeError("created mapping job disappeared")
        state = (current["status"], current.get("progress"), current.get("message"))
        if state != last:
            print(
                f"job={job_id} status={state[0]} progress={state[1]} "
                f"message={state[2]}",
                flush=True,
            )
            last = state
        if current["status"] == "DONE":
            break
        if current["status"] == "FAILED":
            raise RuntimeError(
                f"mapping job failed: {current.get('error') or current.get('message')}"
            )
        time.sleep(2)
    else:
        raise RuntimeError("mapping job did not finish within 240 seconds")

    _, layers = json_request("GET", f"{PUBLIC}/api/mapping/layers")
    layer = next((entry for entry in layers if entry.get("jobId") == job_id), None)
    if layer is None:
        raise RuntimeError("completed mapping job produced no visible layer")
    if layer["type"] != "xyz" or layer["format"] != "png":
        raise RuntimeError(f"unexpected layer contract: {layer}")

    bounds = layer.get("boundsWgs84")
    if not isinstance(bounds, list) or len(bounds) != 4:
        raise RuntimeError(f"layer has no WGS84 bounds: {layer}")
    zoom = int(layer["maxZoom"])
    x, y = center_tile(bounds, zoom)
    tile_path = (
        layer["tileUrl"]
        .replace("{z}", str(zoom))
        .replace("{x}", str(x))
        .replace("{y}", str(y))
    )

    tile_status, tile, headers = request(
        "GET", f"{PUBLIC}{tile_path}", timeout=60
    )
    if tile_status != 200:
        raise RuntimeError(f"tile request returned {tile_status}")
    if not tile.startswith(b"\x89PNG\r\n\x1a\n"):
        raise RuntimeError(
            f"tile is not PNG (content-type={headers.get('Content-Type')})"
        )

    print(
        json.dumps(
            {
                "status": "PASS",
                "jobId": job_id,
                "assetId": ASSET_ID,
                "objectKey": object_key,
                "layerId": layer["id"],
                "tile": {"z": zoom, "x": x, "y": y, "bytes": len(tile)},
            },
            sort_keys=True,
        ),
        flush=True,
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"MAPPING_E2E_ERROR={type(exc).__name__}: {exc}", file=sys.stderr)
        raise
