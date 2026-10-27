# Repository-backed local production updates

GitHub Actions remains disabled. Existing production delivery is:

1. Review application/dependency changes in this repository. Keep original Git
   history; generated dependency/build trees and runtime credentials stay out of Git.
2. Generate the four committed v3 lockfiles with the existing supported Windows
   Node/npm operator via `python -I -B ops/refresh-locks-windows.py <fresh-receipt-prefix>`. Its exact tool hashes and
   command/cache/AppData/temp ownership are recorded in the task receipts. It runs
   package-lock-only, ignores scripts, uses Linux/x64/glibc targets and creates no
   host node_modules. Reuse the declared F-backed root; never use runtime AppData.
   A new update must supply a fresh non-overwriting receipt prefix in that same
   owned task root after checking capacity; do not replay completed receipts.
3. Commit/push the exact reviewed source. In the existing Ubuntu WSL operator
   environment run `python3 -B ops/publish.py --repo "$PWD" --commit <full-sha>
   --service ruckus-bot --apply`. This reads canonical Git blobs and publishes only
   `docker.io/jtmb92/ruckus-bot:git-<full-sha>` through the existing approved account.
   It refuses to overwrite an immutable tag. Repository/revision labels and remote
   manifest/config hashes are checked after publication.
4. Scan the exact resulting digest with fresh pinned public inputs, preserve raw
   findings and source/backup/rollback evidence. Review only the intended private
   branconet-charts image change. Local validation promotes validated; Flux owns
   production rollout. There is no saved-image or second-registry deployment path.
5. Verify database users/roles/hashes and original rows, native Secret/volume/
   Service/Ingress identities, native bcrypt, API/dashboard behavior, real bot
   gateway connection, database reconnection and distinct restart. Do not send
   Discord test messages or mutate accounts/data for a read-only observation.
   Perform normal browser acceptance only after all implementation is complete.

Both images use the pinned maintained official Node22.23.4 Trixie slim base.
The official npm12.2.1 tarball is SHA256/SHA512-bound. Application packages install
from committed locks with scripts disabled; bcrypt's bundled native compatibility
is checked before publication. The Next build uses one worker. Production keeps
all three original supervisor program names and the existing native environment.
Supervisor directly runs the same API, bot entry point and built Next dashboard
on their original ports. Its bot_run restart target and restart policy remain.
Unused npm/npx/nodemon/Yarn/Corepack and build-only Next cache are excluded from
the final runtime. The API lock overrides proxy-addr to its patched2.0.8 release.
The callback MySQL client moves
to maintained mysql2 using the same SQL, credentials and schema.

All compiler/context/cache/client/temp/socket outputs use the established F-backed
operator task root. The isolated builder uses3GiB RAM, zero swap,1.5CPU,512processes
and a2GiB allocated budget; C: and both F: filesystems preserve15GiB after the
estimated stage. No shared container, builder default, image, volume, Strata or user
settings are stopped/changed. The publisher stops/removes its exact new builder
on exit. Reconcile its inactive reproducible generated work before completion,
keeping original source/locks, required immutable runtime, failures and minimal
exact source/resource/registry/validation receipts. Never prune unrelated work.
