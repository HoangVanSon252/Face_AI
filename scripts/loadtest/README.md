# Load test (Locust)

Measures the SLA in `KE_HOACH_NANG_CAP_HE_THONG_200_USER.md` §1.3 against the
local Docker stack, on real data, without leaving test data behind.

```sh
# 1. Open N sessions of the lecturer (originals saved for restore)
docker compose exec -T backend python - open 10 < scripts/loadtest/prepare_sessions.py
#    -> prints e.g. [15, 16, ...]

# 2. A JPEG data URL of a face that is NOT enrolled (full pipeline, no records)
#    e.g. scripts/loadtest/stranger_face.txt

# 3. Run Locust in a throwaway container on the compose network
docker run --rm --network face_ai_default \
  -v "$PWD/scripts/loadtest:/mnt/locust" \
  -e SESSION_IDS=15,16,17 -e FACE_IMAGE=/mnt/locust/stranger_face.txt \
  locustio/locust:2.37.11 -f /mnt/locust/locustfile.py \
  --headless -u 210 -r 20 -t 5m --host http://frontend --csv /mnt/locust/result

# 4. Restore the sessions (also deletes any record/evidence the test created)
docker compose exec -T backend python - restore < scripts/loadtest/prepare_sessions.py
```

- `-u 210` = 10 kiosks (`KioskUser`, one per session, 1 frame / 1.6s) + 200 students.
- Per-session rate limit is 90/min, so each kiosk needs its own session.
- Pass criteria: recognitions p95 ≤ 1.5s and failures < 0.1% (`result_stats.csv`).
- Watch `docker stats` and, with `--profile monitoring`, Prometheus on :9090.
