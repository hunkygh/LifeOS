const FALLBACK_APP_USER_ID = "5b32fd61-320b-4c0e-89dc-7453bfecc6c1";

export const APP_USER_ID =
  import.meta.env.VITE_APP_USER_ID ||
  import.meta.env.VITE_DEFAULT_USER_ID ||
  FALLBACK_APP_USER_ID;

// Backward-compatible alias while components are migrated.
export const DEFAULT_USER_ID = APP_USER_ID;

if (!import.meta.env.VITE_APP_USER_ID && !import.meta.env.VITE_DEFAULT_USER_ID) {
  console.warn(
    "VITE_APP_USER_ID is not set; using fallback single-tenant user id."
  );
}
