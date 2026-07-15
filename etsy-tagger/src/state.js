// Persisted "once ever" guard — mirrors the extension's chrome.storage `autoTagged`.
// Keyed "orderId#itemIdx" per line item and "orderId#bulk" per order. Once a rule
// tag has fired for a key we never auto-add it again, so a MANUAL removal sticks
// instead of the sweep re-adding it every run.

import fs from 'node:fs';
import { SETTINGS } from './config.js';

export class AutoTagged {
  constructor(file = SETTINGS.autoTaggedPath) {
    this.file = file;
    this.map = {};
    try {
      this.map = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      this.map = {};
    }
    this.dirty = false;
  }

  has(key) {
    return this.map[key] === true;
  }

  mark(key) {
    if (!this.map[key]) {
      this.map[key] = true;
      this.dirty = true;
    }
  }

  save() {
    if (!this.dirty) return;
    fs.writeFileSync(this.file, JSON.stringify(this.map, null, 2));
    this.dirty = false;
  }
}
