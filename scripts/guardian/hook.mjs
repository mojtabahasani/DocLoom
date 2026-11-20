#!/usr/bin/env node
// هوک PostToolUse کلادکد (ADR 0003 §۴): 🔴 → exit 2 + stderr · 🟠/🟡 → additionalContext · پاک → هیچ.
import { hookMain } from '@darwin/guardian';
import { config } from './config.mjs';

hookMain(config);
