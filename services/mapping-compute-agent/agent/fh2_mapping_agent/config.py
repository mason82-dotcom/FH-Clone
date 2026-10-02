"""Settings from environment (compute-agent/.env via docker-compose)."""
import os
import socket
from dataclasses import dataclass


def _env(name: str, default: str | None = None) -> str:
    value = os.environ.get(name, default)
    if value is None or value == "":
        raise RuntimeError(f"environment variable {name} is required")
    return value


@dataclass(frozen=True)
class Settings:
    pi_url: str                 # FH2 Control API, e.g. http://192.168.178.63:8080
    agent_token: str
    agent_id: str
    nodeodm_url: str
    nodeodm_token: str
    work_dir: str
    poll_seconds: int
    lease_seconds: int
    heartbeat_seconds: int
    max_images: int             # refuse jobs above this (RAM limit of the node)
    target_crs: str             # CRS of the delivered COGs
    tile_min_zoom_span: int     # tiles from (maxzoom - span) to maxzoom
    download_workers: int
    upload_workers: int
    keep_failed: bool
    gpu: bool


def load() -> Settings:
    lease = int(_env("LEASE_SECONDS", "600"))
    return Settings(
        pi_url=_env("FH2_URL").rstrip("/"),
        agent_token=_env("MAPPING_AGENT_TOKEN"),
        agent_id=_env("AGENT_ID", socket.gethostname()[:64]),
        nodeodm_url=_env("NODEODM_URL", "http://nodeodm:3000").rstrip("/"),
        nodeodm_token=_env("NODEODM_TOKEN"),
        work_dir=_env("WORK_DIR", "/work"),
        poll_seconds=int(_env("POLL_SECONDS", "20")),
        lease_seconds=lease,
        heartbeat_seconds=int(_env("HEARTBEAT_SECONDS", str(max(10, lease // 5)))),
        max_images=int(_env("MAX_IMAGES", "200")),
        target_crs=_env("TARGET_CRS", "EPSG:25832"),
        tile_min_zoom_span=int(_env("TILE_ZOOM_SPAN", "5")),
        download_workers=int(_env("DOWNLOAD_WORKERS", "4")),
        upload_workers=int(_env("UPLOAD_WORKERS", "8")),
        keep_failed=_env("KEEP_FAILED", "false").lower() == "true",
        gpu=_env("GPU", "false").lower() == "true",
    )
