"""FH2 compute agent: pulls mapping jobs from the Pi, runs them on NodeODM, uploads results.

Pull model (mapping-tool/docs/adr-001-architektur.md): the node only makes outgoing requests and may be
switched off at any time; an expired lease puts the job back into the FH2 queue.
"""
import hashlib
import json
import logging
import os
import shutil
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from . import config, postprocess
from .clients import CANCELED, COMPLETED, FAILED, LeaseLost, NodeOdmClient, NodeOdmError, PiClient
from .http import download, put_file

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("agent")


class JobAborted(Exception):
    pass


class Heartbeat(threading.Thread):
    """Keeps the lease alive and reports progress; flags the job as lost on 409."""

    def __init__(self, pi: PiClient, job_id: str, interval: int):
        super().__init__(daemon=True)
        self.pi, self.job_id, self.interval = pi, job_id, interval
        self.progress, self.message = 0.0, "claimed"
        self.lost = threading.Event()
        self.reason = ""
        self.stop = threading.Event()

    def set(self, progress: float, message: str) -> None:
        self.progress, self.message = progress, message
        log.info("job %s: %.1f%% %s", self.job_id[:8], progress, message)

    def check(self) -> None:
        if self.lost.is_set():
            raise JobAborted("canceled by user" if "canceled" in self.reason
                             else "lease lost (job re-queued or taken over in FH2)")

    def run(self) -> None:
        while not self.stop.wait(self.interval):
            try:
                self.pi.heartbeat(self.job_id, self.progress, self.message)
            except LeaseLost as exc:
                self.reason = str(exc)
                self.lost.set()
                return
            except Exception as exc:          # network hiccup: retry on the next tick
                log.warning("heartbeat failed: %s", exc)


def odm_options(job_options: dict, supported: list[dict], gpu: bool) -> list[dict]:
    names = {o["name"] for o in supported}
    wanted = dict(job_options.get("odm") or {})
    if not gpu and "no-gpu" in names:
        wanted.setdefault("no-gpu", True)
    unknown = sorted(k for k in wanted if k not in names)
    if unknown:
        log.warning("dropping options unknown to this NodeODM: %s", unknown)
    return [{"name": k, "value": v} for k, v in wanted.items() if k in names]


def process(settings: config.Settings, pi: PiClient, odm: NodeOdmClient, claim: dict) -> None:
    job, images = claim["job"], claim["images"]
    job_id = job["id"]
    work = Path(settings.work_dir) / job_id
    hb = Heartbeat(pi, job_id, settings.heartbeat_seconds)
    hb.start()
    task_uuid = None
    try:
        if len(images) > settings.max_images:
            raise RuntimeError(f"{len(images)} images exceed MAX_IMAGES={settings.max_images} of this node "
                               f"(RAM limit); split the job or use a larger node")
        node = odm.info()
        if node.get("maxImages") and len(images) > node["maxImages"]:
            raise RuntimeError(f"NodeODM accepts at most {node['maxImages']} images")

        # 1. download input images (presigned GET from MinIO in FH2)
        img_dir = work / "images"
        img_dir.mkdir(parents=True, exist_ok=True)
        done = 0

        def fetch(item: dict) -> None:
            nonlocal done
            base = item["key"].rsplit("/", 1)[-1]
            prefix = hashlib.sha256(item["key"].encode("utf-8")).hexdigest()[:12]
            name = f"{prefix}_{base}"
            download(item["url"], str(img_dir / name))
            done += 1
            hb.set(10 * done / len(images), f"downloading images {done}/{len(images)}")

        with ThreadPoolExecutor(settings.download_workers) as pool:
            list(pool.map(fetch, images))
        hb.check()

        # 2. NodeODM task: init -> upload -> commit
        options = odm_options(job.get("options", {}), odm.options(), settings.gpu)
        task_uuid = odm.init(f"fh2-{job_id}", options, postprocess.NODEODM_OUTPUTS)
        files = sorted(img_dir.iterdir())
        for i, f in enumerate(files, 1):
            odm.upload(task_uuid, f.name, f.read_bytes())
            hb.set(10 + 5 * i / len(files), f"uploading to NodeODM {i}/{len(files)}")
            hb.check()
        odm.commit(task_uuid)
        log.info("job %s: NodeODM task %s, options %s", job_id[:8], task_uuid, options)

        # 3. wait for processing (progress 15..80 %)
        while True:
            hb.check()
            info = odm.task_info(task_uuid)
            code = info["status"]["code"]
            if code == COMPLETED:
                break
            if code in (FAILED, CANCELED):
                tail = " | ".join(line.strip() for line in odm.output(task_uuid, 15) if line.strip())
                raise RuntimeError(f"NodeODM task {'failed' if code == FAILED else 'canceled'}: "
                                   f"{info['status'].get('errorMessage', '')} {tail}"[:1900])
            hb.set(15 + 0.65 * float(info.get("progress", 0)), f"NodeODM processing ({info.get('progress', 0):.0f} %)")
            time.sleep(10)
        gpu_used = any("GPU" in line and "SIFT" in line for line in odm.output(task_uuid, 400))

        # 4. download and post-process
        hb.set(80, "downloading NodeODM results")
        zip_path = work / "all.zip"
        download(odm.download_url(task_uuid), str(zip_path), timeout=3600)
        hb.check()
        hb.set(83, "building COGs and tiles")
        found = postprocess.extract(zip_path, work / "odm")
        out = work / "out"
        manifest = postprocess.build(found, out, settings.target_crs, settings.tile_min_zoom_span, os.cpu_count() or 2)
        manifest["files"].append({"path": "manifest.json", "kind": "manifest"})
        manifest["source"]["gpu_sift"] = gpu_used
        (out / "manifest.json").write_text(json.dumps(manifest, indent=2))
        hb.check()

        # 5. upload results (presigned PUT under mapping-results/{jobId}/)
        paths = postprocess.upload_list(out)
        urls = pi.upload_urls(job_id, paths)
        sent = 0

        def push(path: str) -> None:
            nonlocal sent
            ctype = "image/png" if path.endswith(".png") else (
                "application/json" if path.endswith(".json") else "application/octet-stream")
            put_file(urls[path], str(out / path), ctype)
            sent += 1
            if sent % 50 == 0 or sent == len(paths):
                hb.set(85 + 14 * sent / len(paths), f"uploading results {sent}/{len(paths)}")

        with ThreadPoolExecutor(settings.upload_workers) as pool:
            list(pool.map(push, paths))
        hb.check()

        # 6. complete (the Pi checks that the files exist and creates the map layer)
        manifest.pop("source", None)
        result = pi.complete(job_id, manifest)
        log.info("job %s done, layer %s, gpu_sift=%s", job_id[:8], result.get("layer_id"), gpu_used)
    except JobAborted as exc:
        log.warning("job %s aborted: %s", job_id[:8], exc)
        if task_uuid:
            _quiet(odm.cancel, task_uuid)
    except LeaseLost:
        log.warning("job %s: lease lost", job_id[:8])
    except Exception as exc:
        log.exception("job %s failed", job_id[:8])
        if task_uuid:
            _quiet(odm.cancel, task_uuid)
        _quiet(pi.fail, job_id, f"{type(exc).__name__}: {exc}")
        if settings.keep_failed:
            work = None
    finally:
        hb.stop.set()
        if task_uuid:
            _quiet(odm.remove, task_uuid)
        if work is not None:
            shutil.rmtree(work, ignore_errors=True)


def _quiet(fn, *args) -> None:
    try:
        fn(*args)
    except Exception as exc:
        log.warning("%s failed: %s", fn.__name__, exc)


def capabilities(odm: NodeOdmClient, settings: config.Settings) -> dict:
    info = odm.info()
    return {
        "engine": f"{info.get('engine', 'odm')} {info.get('engineVersion', '?')}",
        "nodeodm": info.get("version"),
        "ram_gb": round(info.get("totalMemory", 0) / 2 ** 30, 1),
        "cpu_cores": info.get("cpuCores"),
        "max_images": settings.max_images,
        "gpu": settings.gpu,
    }


def main() -> None:
    settings = config.load()
    pi, odm = PiClient(settings), NodeOdmClient(settings)
    Path(settings.work_dir).mkdir(parents=True, exist_ok=True)
    log.info("agent %s polling %s every %ss", settings.agent_id, settings.pi_url, settings.poll_seconds)
    while True:
        try:
            claim = pi.claim(capabilities(odm, settings))
            if claim:
                log.info("claimed job %s '%s' with %d images", claim["job"]["id"], claim["job"]["name"],
                         len(claim["images"]))
                process(settings, pi, odm, claim)
                continue                       # look for the next job right away
        except (NodeOdmError, OSError) as exc:
            log.warning("NodeODM or FH2 not reachable: %s", exc)
        except Exception:
            log.exception("unexpected error in the claim loop")
        time.sleep(settings.poll_seconds)


if __name__ == "__main__":
    main()
