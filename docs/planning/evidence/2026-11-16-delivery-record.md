# Delivery record — local HTTPS preview

| Field | Value |
| --- | --- |
| Date | 2026-11-16 |
| Server | `serve_files.py` from the artifact-delivery skill, exact-file mappings only |
| Process | PID recorded in the session shell (`python3 -B /tmp/ruckus-deliver.py`), background task sh_1e7a152f8001Dx1pseu0JCzYTf |
| Bind | `127.0.0.1:18451` (IPv4 loopback only) |
| Certificate | `H:\AgentArtifacts\projects\ruckus_bot\state\tls\localhost-cert.pem` (CN=localhost, SAN DNS:localhost, IP:127.0.0.1, valid 2026-11-17 → 2026-12-17) |
| Private key | Same state directory, mode 0600 requested (drvfs does not enforce POSIX modes); never served, never in the repository |
| Routes | 55 explicit mappings: planning documents, contracts, operating kit, memory notes, research, diagrams, mockups, canonical JSON, both workbooks, and the consolidated ZIP |
| Verification (WSL) | `curl --cacert <cert>` returned 200 with the expected content type and title for the review, start-here, roadmap, validation report, API contract, tracker, and ZIP; ZIP downloaded with 74 entries and `testzip() == None` |
| Verification (Windows) | `curl.exe --cacert H:\…\localhost-cert.pem https://localhost:18451/docs_planning_operations_00_START_HERE.md` returned 200 `text/html` |
| Link crawl | 55 internal HTTPS links across 8 served pages, 0 broken |
| End condition | Keep the server alive for this delivery. It may be stopped after the owner has opened the links; no other consumer depends on it. Restart with `python3 -B /tmp/ruckus-deliver.py` (script is outside the repository) after confirming port 18451 is free. |
| Security | Loopback only; no public hosting, no tunnel, no directory listing, no credential files mapped, CSP `default-src 'none'` with inline style only. |

The self-signed certificate will show a warning in the browser until accepted once.
