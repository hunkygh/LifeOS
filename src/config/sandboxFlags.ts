const parseBooleanFlag = (value: string | undefined, fallback: boolean) => {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

export const SANDBOX_SAFE_MODE = parseBooleanFlag(
  import.meta.env.VITE_LIFEOS_SAFE_SANDBOX_MODE,
  true
);
