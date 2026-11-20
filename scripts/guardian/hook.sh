#!/bin/sh
# کلادکد این را بعد از هر Edit/Write/MultiEdit صدا می‌زند. هر خطای داخلی باید خاموش باشد
# (exit 0)، وگرنه نگهبان خودش جلوی کار را می‌گیرد — ADR 0003 §۴.
exec node "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}/scripts/guardian/hook.mjs" || exit 0
