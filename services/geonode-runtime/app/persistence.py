from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict

from minio import Minio
from psycopg import connect


def persist_to_minio(local_path: Path, object_name: str) -> Dict[str, Any]:
    endpoint = os.getenv("MINIO_ENDPOINT")
    access_key = os.getenv("MINIO_ACCESS_KEY", "geonexus")
    secret_key = os.getenv("MINIO_SECRET_KEY", "geonexus123")
    bucket = os.getenv("MINIO_BUCKET", "geonexus-artifacts")
    if not endpoint:
        return {"enabled": False, "reason": "MINIO_ENDPOINT not configured"}
    client = Minio(endpoint, access_key=access_key, secret_key=secret_key, secure=False)
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)
    client.fput_object(bucket, object_name, str(local_path))
    return {"enabled": True, "bucket": bucket, "object": object_name, "uri": f"s3://{bucket}/{object_name}"}


def persist_to_postgis(job: Dict[str, Any], artifact: Dict[str, Any]) -> Dict[str, Any]:
    dsn = os.getenv("POSTGIS_DSN")
    if not dsn:
        return {"enabled": False, "reason": "POSTGIS_DSN not configured"}
    with connect(dsn) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS geonode_jobs (
                    id TEXT PRIMARY KEY,
                    skill_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    progress INTEGER NOT NULL,
                    request JSONB NOT NULL,
                    artifact JSONB NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ DEFAULT now()
                )
                """
            )
            cur.execute(
                """
                INSERT INTO geonode_jobs (id, skill_id, status, progress, request, artifact, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, now())
                ON CONFLICT (id) DO UPDATE SET
                    status = EXCLUDED.status,
                    progress = EXCLUDED.progress,
                    request = EXCLUDED.request,
                    artifact = EXCLUDED.artifact,
                    updated_at = now()
                """,
                (
                    job["id"],
                    job["skill_id"],
                    job["status"],
                    job["progress"],
                    json.dumps(job["request"]),
                    json.dumps(artifact),
                ),
            )
    return {"enabled": True, "table": "geonode_jobs"}
