"""Tiny HTTP helpers on the standard library (no third-party dependencies in the agent)."""
import http.client
import json
import os
import shutil
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid


class HttpError(Exception):
    def __init__(self, status: int, body: str, url: str):
        super().__init__(f"HTTP {status} for {url.split('?')[0]}: {body[:300]}")
        self.status = status
        self.body = body


def request(method: str, url: str, *, json_body=None, data: bytes | None = None, headers: dict | None = None,
            timeout: float = 60) -> tuple[int, bytes]:
    hdrs = dict(headers or {})
    if json_body is not None:
        data = json.dumps(json_body).encode()
        hdrs["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=hdrs)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as exc:
        raise HttpError(exc.code, exc.read().decode(errors="replace"), url) from exc


def form_urlencoded(fields: dict) -> tuple[bytes, dict]:
    return urllib.parse.urlencode(fields).encode(), {"Content-Type": "application/x-www-form-urlencoded"}


def multipart(fields: dict[str, str], files: list[tuple[str, str, bytes]]) -> tuple[bytes, dict]:
    """fields: name -> value; files: (field, filename, content)."""
    boundary = uuid.uuid4().hex
    parts = []
    for name, value in fields.items():
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    for field, filename, content in files:
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{field}"; filename="{filename}"\r\n'
                     f"Content-Type: application/octet-stream\r\n\r\n".encode() + content + b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())
    return b"".join(parts), {"Content-Type": f"multipart/form-data; boundary={boundary}"}


def download(url: str, path: str, timeout: float = 300, retries: int = 3) -> int:
    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(url, timeout=timeout) as resp, open(path, "wb") as out:
                shutil.copyfileobj(resp, out, length=1024 * 1024)
            return int(resp.headers.get("Content-Length") or 0)
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if attempt == retries:
                raise
            time.sleep(2 * attempt)
    return 0


def put_file(url: str, path: str, content_type: str = "application/octet-stream", retries: int = 3) -> None:
    """Stream a file to a presigned PUT URL without loading large COGs into RAM."""
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ValueError("presigned upload URL must use http/https")
    target = parsed.path + (f"?{parsed.query}" if parsed.query else "")
    size = os.path.getsize(path)

    for attempt in range(1, retries + 1):
        connection = None
        try:
            cls = http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection
            connection = cls(parsed.hostname, parsed.port, timeout=300)
            connection.putrequest("PUT", target)
            connection.putheader("Content-Type", content_type)
            connection.putheader("Content-Length", str(size))
            connection.endheaders()

            with open(path, "rb") as source:
                while chunk := source.read(1024 * 1024):
                    connection.send(chunk)

            response = connection.getresponse()
            payload = response.read()
            if not 200 <= response.status < 300:
                raise HttpError(response.status, payload.decode(errors="replace"), url)
            return
        except (HttpError, OSError, TimeoutError, ConnectionError):
            if attempt == retries:
                raise
            time.sleep(2 * attempt)
        finally:
            if connection is not None:
                connection.close()
