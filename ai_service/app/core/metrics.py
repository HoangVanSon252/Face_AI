"""Prometheus metrics without third-party instrumentation (multi-worker safe).

Pure ASGI middleware labelled by the route *template* (e.g.
/api/v1/sessions/{session_id}/recognitions), so ids do not explode label
cardinality. With PROMETHEUS_MULTIPROC_DIR set (Dockerfile), every uvicorn
worker writes its own files and /metrics aggregates them.
"""
import os
import time

from prometheus_client import CONTENT_TYPE_LATEST, CollectorRegistry, Counter, Histogram, generate_latest
from prometheus_client import multiprocess
from starlette.requests import Request
from starlette.responses import Response

REQUESTS = Counter("http_requests_total", "HTTP requests", ["method", "route", "status"])
LATENCY = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency",
    ["method", "route"],
    buckets=(0.025, 0.05, 0.1, 0.25, 0.5, 0.75, 1.0, 1.5, 2.5, 5.0, 10.0),
)
_SKIPPED = {"/metrics", "/health", "/ready"}


def _route_template(scope) -> str:
    """Full path with parameter values put back as {name} (e.g. /api/v1/sessions/{session_id})."""
    if scope.get("route") is None:
        return "unmatched"
    path = scope.get("path", "")
    for name, value in (scope.get("path_params") or {}).items():
        path = path.replace(f"/{value}", f"/{{{name}}}", 1)
    return path


class MetricsMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("path") in _SKIPPED:
            await self.app(scope, receive, send)
            return
        status = {"code": 500}

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                status["code"] = message["status"]
            await send(message)

        started = time.perf_counter()
        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            route = _route_template(scope)
            method = scope.get("method", "")
            LATENCY.labels(method, route).observe(time.perf_counter() - started)
            REQUESTS.labels(method, route, str(status["code"])).inc()


def metrics_endpoint(_: Request) -> Response:
    if os.environ.get("PROMETHEUS_MULTIPROC_DIR"):
        registry = CollectorRegistry()
        multiprocess.MultiProcessCollector(registry)
    else:
        from prometheus_client import REGISTRY as registry
    return Response(generate_latest(registry), media_type=CONTENT_TYPE_LATEST)
