"""Clients for the Pi mapping service (mapping-tool/docs/agent-api.md) and the NodeODM REST API."""
import json
import urllib.parse

from .config import Settings
from .http import HttpError, form_urlencoded, multipart, request


class LeaseLost(Exception):
    """The Pi answered 409: the job is no longer leased to this agent."""


class PiClient:
    def __init__(self, settings: Settings):
        self.base = f"{settings.pi_url}/api/mapping/agent"
        self.agent_id = settings.agent_id
        self.lease = settings.lease_seconds
        self.headers = {"Authorization": f"Bearer {settings.agent_token}"}

    def _post(self, path: str, body: dict, timeout: float = 60):
        try:
            status, payload = request("POST", self.base + path, json_body={"agent_id": self.agent_id, **body},
                                      headers=self.headers, timeout=timeout)
        except HttpError as exc:
            if exc.status == 409:
                raise LeaseLost(exc.body) from exc
            raise
        return status, (json.loads(payload) if payload else None)

    def claim(self, capabilities: dict) -> dict | None:
        status, data = self._post("/claim", {"lease_seconds": self.lease, "capabilities": capabilities})
        return None if status == 204 else data

    def heartbeat(self, job_id: str, progress: float, message: str) -> dict:
        return self._post(f"/jobs/{job_id}/heartbeat", {"progress": round(max(0.0, min(progress, 100.0)), 2),
                                                        "message": message[:500], "lease_seconds": self.lease})[1]

    def image_urls(self, job_id: str) -> list[dict]:
        return self._post(f"/jobs/{job_id}/image-urls", {})[1]["images"]

    def upload_urls(self, job_id: str, paths: list[str]) -> dict[str, str]:
        urls: dict[str, str] = {}
        for i in range(0, len(paths), 1000):
            urls.update(self._post(f"/jobs/{job_id}/upload-urls", {"paths": paths[i:i + 1000]})[1]["urls"])
        return urls

    def complete(self, job_id: str, manifest: dict) -> dict:
        return self._post(f"/jobs/{job_id}/complete", {"manifest": manifest}, timeout=300)[1]

    def fail(self, job_id: str, error: str) -> None:
        self._post(f"/jobs/{job_id}/fail", {"error": error[:2000]})


class NodeOdmError(Exception):
    pass


class NodeOdmClient:
    """NodeODM / NodeODX API v2. Only the HTTP API is used (AGPL engine stays a separate container)."""

    def __init__(self, settings: Settings):
        self.base = settings.nodeodm_url
        self.token = settings.nodeodm_token

    def _url(self, path: str, **params) -> str:
        params["token"] = self.token
        return f"{self.base}{path}?{urllib.parse.urlencode(params)}"

    def _json(self, method: str, path: str, data: bytes | None = None, headers: dict | None = None,
              timeout: float = 60, **params):
        _, payload = request(method, self._url(path, **params), data=data, headers=headers, timeout=timeout)
        result = json.loads(payload) if payload else None
        if isinstance(result, dict) and result.get("error"):
            raise NodeOdmError(f"{path}: {result['error']}")
        return result

    def info(self) -> dict:
        return self._json("GET", "/info")

    def options(self) -> list[dict]:
        return self._json("GET", "/options")

    def init(self, name: str, options: list[dict], outputs: list[str]) -> str:
        # must be multipart: NodeODM silently ignores an urlencoded init body (name, options, outputs)
        body, headers = multipart({"name": name, "options": json.dumps(options), "outputs": json.dumps(outputs)}, [])
        return self._json("POST", "/task/new/init", data=body, headers=headers)["uuid"]

    def upload(self, uuid: str, filename: str, content: bytes) -> None:
        body, headers = multipart({}, [("images", filename, content)])
        result = self._json("POST", f"/task/new/upload/{uuid}", data=body, headers=headers, timeout=300)
        if not (isinstance(result, dict) and result.get("success")):
            raise NodeOdmError(f"upload of {filename} failed: {result}")

    def commit(self, uuid: str) -> None:
        self._json("POST", f"/task/new/commit/{uuid}")

    def task_info(self, uuid: str) -> dict:
        return self._json("GET", f"/task/{uuid}/info")

    def output(self, uuid: str, last_lines: int = 40) -> list[str]:
        return self._json("GET", f"/task/{uuid}/output", line=-last_lines) or []

    def download_url(self, uuid: str, asset: str = "all.zip") -> str:
        return self._url(f"/task/{uuid}/download/{asset}")

    def cancel(self, uuid: str) -> None:
        body, headers = form_urlencoded({"uuid": uuid})
        self._json("POST", "/task/cancel", data=body, headers=headers)

    def remove(self, uuid: str) -> None:
        body, headers = form_urlencoded({"uuid": uuid})
        self._json("POST", "/task/remove", data=body, headers=headers)


# NodeODM task status codes
QUEUED, RUNNING, FAILED, COMPLETED, CANCELED = 10, 20, 30, 40, 50
