// Logging simple con timestamp (regla CLAUDE.md: logs con timestamp en cada importacion).
function ts() {
  return new Date().toISOString();
}

export function log(...args) {
  console.log(`[${ts()}]`, ...args);
}

export function warn(...args) {
  console.warn(`[${ts()}] AVISO:`, ...args);
}

export function error(...args) {
  console.error(`[${ts()}] ERROR:`, ...args);
}
