#!/usr/bin/env python3
"""Fake NodeODM for agent tests without photogrammetry (runs in the agent image, needs GDAL).

Implements the NodeODM v2 calls the agent uses. 'Processing' takes a few polls; the result all.zip
contains the first uploaded image georeferenced as an orthophoto (EPSG:32632, ~0.1 m/px) at the
given position, plus a float DSM derived from it.

  python3 fake_nodeodm.py --port 3001 --token testtoken --lon 8.5898 --lat 49.1574
"""
import argparse
import cgi
import json
import subprocess
import tempfile
import uuid as uuidlib
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from osgeo import osr

OPTIONS = ["fast-orthophoto", "feature-quality", "pc-quality", "skip-3dmodel", "dsm", "no-gpu",
           "orthophoto-resolution"]
TASKS: dict[str, dict] = {}
WORK = Path(tempfile.mkdtemp(prefix="fake-nodeodm-"))


def utm_of(lon: float, lat: float) -> tuple[float, float]:
    src, dst = osr.SpatialReference(), osr.SpatialReference()
    src.ImportFromEPSG(4326)
    dst.ImportFromEPSG(32632)
    src.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    dst.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    x, y, _ = osr.CoordinateTransformation(src, dst).TransformPoint(lon, lat)
    return x, y


def build_result(task: dict, lon: float, lat: float) -> Path:
    d = WORK / task["uuid"]
    first = sorted(d.glob("img_*"))[0]
    cx, cy = utm_of(lon, lat)
    w, h = 80.0, 60.0                                  # metres on the ground
    ortho_dir, dem_dir = d / "odm_orthophoto", d / "odm_dem"
    ortho_dir.mkdir(exist_ok=True)
    dem_dir.mkdir(exist_ok=True)
    plain = d / "plain.tif"
    subprocess.run(["gdal_translate", "-q", "-outsize", "800", "600", "-a_srs", "EPSG:32632",
                    "-a_ullr", str(cx - w / 2), str(cy + h / 2), str(cx + w / 2), str(cy - h / 2),
                    str(first), str(plain)], check=True)
    # alpha band like ODM (transparent outside the mosaic)
    subprocess.run(["gdalwarp", "-q", "-dstalpha", str(plain), str(ortho_dir / "odm_orthophoto.tif")], check=True)
    subprocess.run(["gdal_translate", "-q", "-ot", "Float32", "-b", "1", "-scale", "0", "255", "110", "130",
                    str(plain), str(dem_dir / "dsm.tif")], check=True)
    z = d / "all.zip"
    with zipfile.ZipFile(z, "w") as zf:
        zf.write(ortho_dir / "odm_orthophoto.tif", "odm_orthophoto/odm_orthophoto.tif")
        zf.write(dem_dir / "dsm.tif", "odm_dem/dsm.tif")
    return z


class Handler(BaseHTTPRequestHandler):
    def _send(self, obj, status=200, raw: bytes | None = None, ctype="application/json"):
        body = raw if raw is not None else json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _auth(self) -> bool:
        if parse_qs(urlparse(self.path).query).get("token", [""])[0] != self.server.token:
            self._send({"error": "Invalid authentication token: token does not match."})
            return False
        return True

    def _form(self) -> cgi.FieldStorage:
        return cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ={"REQUEST_METHOD": "POST"})

    def do_GET(self):
        if not self._auth():
            return
        parts = urlparse(self.path).path.strip("/").split("/")
        if parts == ["info"]:
            return self._send({"version": "fake-3.6.2", "engine": "odm", "engineVersion": "fake",
                               "maxImages": None, "totalMemory": 16 * 2 ** 30, "cpuCores": 8, "taskQueueCount": 0})
        if parts == ["options"]:
            return self._send([{"name": n, "type": "string", "value": "", "domain": "", "help": ""} for n in OPTIONS])
        if len(parts) >= 3 and parts[0] == "task" and parts[1] in TASKS:
            task = TASKS[parts[1]]
            if parts[2] == "info":
                if task["code"] == 20:
                    task["progress"] = min(100, task["progress"] + 35)
                    if task["progress"] >= 100:
                        task["zip"] = build_result(task, self.server.lon, self.server.lat)
                        task["code"] = 40
                return self._send({"uuid": task["uuid"], "name": task["name"], "status": {"code": task["code"]},
                                   "progress": task["progress"], "imagesCount": task["images"],
                                   "options": task["options"]})
            if parts[2] == "output":
                return self._send(["fake ODM: started", "fake ODM: done"])
            if parts[2] == "download":
                return self._send(None, raw=task["zip"].read_bytes(), ctype="application/zip")
        self._send({"error": "not found"}, 404)

    def do_POST(self):
        if not self._auth():
            return
        parts = urlparse(self.path).path.strip("/").split("/")
        form = self._form()
        if parts[:3] == ["task", "new", "init"]:
            uid = str(uuidlib.uuid4())
            (WORK / uid).mkdir()
            TASKS[uid] = {"uuid": uid, "name": form.getfirst("name"), "code": 10, "progress": 0, "images": 0,
                          "options": json.loads(form.getfirst("options") or "[]")}
            return self._send({"uuid": uid})
        if parts[:3] == ["task", "new", "upload"] and parts[3] in TASKS:
            task = TASKS[parts[3]]
            item = form["images"]
            (WORK / task["uuid"] / f"img_{task['images']:04d}_{Path(item.filename).name}").write_bytes(item.file.read())
            task["images"] += 1
            return self._send({"success": True})
        if parts[:3] == ["task", "new", "commit"] and parts[3] in TASKS:
            TASKS[parts[3]]["code"] = 20
            return self._send({"uuid": parts[3]})
        if parts[:2] in (["task", "cancel"], ["task", "remove"]):
            uid = form.getfirst("uuid")
            if parts[1] == "remove":
                TASKS.pop(uid, None)
            elif uid in TASKS:
                TASKS[uid]["code"] = 50
            return self._send({"success": True})
        self._send({"error": "not found"}, 404)

    def log_message(self, fmt, *args):
        print("fake-nodeodm:", fmt % args, flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=3001)
    ap.add_argument("--token", default="testtoken")
    ap.add_argument("--lon", type=float, default=8.5898)
    ap.add_argument("--lat", type=float, default=49.1574)
    a = ap.parse_args()
    srv = ThreadingHTTPServer(("0.0.0.0", a.port), Handler)
    srv.token, srv.lon, srv.lat = a.token, a.lon, a.lat
    print(f"fake NodeODM on :{a.port}", flush=True)
    srv.serve_forever()
