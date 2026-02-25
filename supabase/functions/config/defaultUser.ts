const FALLBACK_APP_USER_ID = "5b32fd61-320b-4c0e-89dc-7453bfecc6c1";

export const APP_USER_ID =
  Deno.env.get("APP_USER_ID") ||
  Deno.env.get("DEFAULT_USER_ID") ||
  FALLBACK_APP_USER_ID;

// Backward-compatible alias while functions are migrated.
export const DEFAULT_USER_ID = APP_USER_ID;
