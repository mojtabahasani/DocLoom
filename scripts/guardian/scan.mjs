#!/usr/bin/env node
// نگهبان کد — اجرای دستی: npm run guard [فایل…] [--json] [--ratchet] [--update-baseline]
import { cliMain } from '@darwin/guardian';
import { config } from './config.mjs';

cliMain(config);
