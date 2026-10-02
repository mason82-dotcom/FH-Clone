"""Turn NodeODM results (all.zip) into the deliverables listed in mapping-tool/docs/agent-api.md."""
import hashlib
import json
import logging
import math
import os
import subprocess
import zipfile
from pathlib import Path

log = logging.getLogger("agent.post")

# paths inside the NodeODM all.zip
ORTHO = "odm_orthophoto/odm_orthophoto.tif"
DSM = "odm_dem/dsm.tif"
DTM = "odm_dem/dtm.tif"
REPORT = "odm_report/report.pdf"
NODEODM_OUTPUTS = [ORTHO, DSM, DTM, REPORT]


def run(cmd: list[str], cwd: Path | None = None) -> str:
    """GDAL writes temporary files next to the output and into CPL_TMPDIR: run inside the job directory."""
    log.info("run %s", " ".join(cmd[:4]) + (" ..." if len(cmd) > 4 else ""))
    env = dict(os.environ, CPL_TMPDIR=str(cwd) if cwd else "/tmp")
    proc = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd, env=env)
    if proc.returncode != 0:
        raise RuntimeError(f"{cmd[0]} failed ({proc.returncode}): {proc.stderr.strip()[-500:]}")
    return proc.stdout


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def extract(zip_path: Path, dest: Path) -> dict[str, Path]:
    found = {}
    with zipfile.ZipFile(zip_path) as zf:
        names = set(zf.namelist())
        for name in NODEODM_OUTPUTS:
            if name in names:
                target = dest / name
                target.parent.mkdir(parents=True, exist_ok=True)
                with zf.open(name) as src, open(target, "wb") as out:
                    while chunk := src.read(1024 * 1024):
                        out.write(chunk)
                found[name] = target
    if ORTHO not in found:
        raise RuntimeError("NodeODM result has no orthophoto (odm_orthophoto/odm_orthophoto.tif)")
    return found


def raster_info(path: Path) -> dict:
    return json.loads(run(["gdalinfo", "-json", str(path)]))


def wgs84_bounds(info: dict) -> list[float]:
    ring = info["wgs84Extent"]["coordinates"][0]
    lons, lats = [p[0] for p in ring], [p[1] for p in ring]
    return [round(min(lons), 7), round(min(lats), 7), round(max(lons), 7), round(max(lats), 7)]


def max_zoom_for(info: dict, bounds: list[float]) -> int:
    """Web Mercator zoom whose pixel size matches the orthophoto ground resolution."""
    res = abs(info["geoTransform"][1])            # metres per pixel (ODM outputs UTM)
    lat = (bounds[1] + bounds[3]) / 2
    z = math.log2(156543.03392 * math.cos(math.radians(lat)) / max(res, 0.005))
    return max(12, min(22, int(math.floor(z))))


def to_cog(src: Path, dst: Path, target_crs: str, float_data: bool) -> None:
    cmd = ["gdalwarp", "-overwrite", "-t_srs", target_crs, "-r", "bilinear" if float_data else "cubic",
           "-of", "COG", "-co", "COMPRESS=DEFLATE", "-co", "BIGTIFF=IF_SAFER", "-co", "NUM_THREADS=ALL_CPUS"]
    if float_data:
        cmd += ["-co", "PREDICTOR=YES"]
    run(cmd + [str(src), str(dst)], cwd=dst.parent)


def build(found: dict[str, Path], out: Path, target_crs: str, zoom_span: int, processes: int) -> dict:
    """Create COGs, XYZ tiles and manifest.json in 'out'. Returns the manifest."""
    out.mkdir(parents=True, exist_ok=True)
    info = raster_info(found[ORTHO])
    bounds = wgs84_bounds(info)
    maxzoom = max_zoom_for(info, bounds)
    minzoom = max(10, maxzoom - zoom_span)
    files: list[dict] = []

    to_cog(found[ORTHO], out / "orthophoto.tif", target_crs, float_data=False)
    files.append({"path": "orthophoto.tif", "kind": "orthophoto_cog"})
    for key, name, kind in ((DSM, "dsm.tif", "dsm_cog"), (DTM, "dtm.tif", "dtm_cog")):
        if key in found:
            to_cog(found[key], out / name, target_crs, float_data=True)
            files.append({"path": name, "kind": kind})
    if REPORT in found:
        (out / "report.pdf").write_bytes(found[REPORT].read_bytes())
        files.append({"path": "report.pdf", "kind": "report"})

    # XYZ (not TMS) web mercator tiles with transparency outside the orthophoto
    run(["gdal2tiles", "--xyz", f"--zoom={minzoom}-{maxzoom}", "--webviewer=none", "--resampling=average",
         f"--processes={max(1, processes)}", "--tiledriver=PNG", str(found[ORTHO]), str(out / "tiles")], cwd=out)

    for f in files:
        p = out / f["path"]
        f["sha256"], f["size"] = sha256(p), p.stat().st_size
    manifest = {
        "crs": target_crs,
        "bounds_wgs84": bounds,
        "files": files,
        "tiles": {"path": "tiles", "format": "png", "minzoom": minzoom, "maxzoom": maxzoom},
        "source": {"odm_crs": info.get("coordinateSystem", {}).get("wkt", "")[:120],
                   "ground_resolution_m": abs(info["geoTransform"][1])},
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2))
    return manifest


def upload_list(out: Path) -> list[str]:
    """All result files relative to 'out' (tiles, COGs, report, manifest)."""
    return sorted(str(p.relative_to(out)).replace(os.sep, "/") for p in out.rglob("*") if p.is_file())
