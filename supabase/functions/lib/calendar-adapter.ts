export type CalendarEventInput = {
  title: string;
  description: string;
  start: string;
  end: string;
  timezone: string;
  recurrence?: string | null;
};

export type CalendarEventResult = {
  eventId: string;
  htmlLink?: string | null;
};

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

function recurrenceToRRule(recurrence?: string | null) {
  if (!recurrence) return null;
  const normalized = recurrence.trim().toLowerCase();
  if (!normalized || normalized === "none") return null;
  if (normalized === "daily") return "RRULE:FREQ=DAILY";
  if (normalized === "weekly") return "RRULE:FREQ=WEEKLY";
  if (normalized === "monthly") return "RRULE:FREQ=MONTHLY";
  if (normalized.startsWith("rrule:")) return normalized.toUpperCase();
  return null;
}

async function fetchJsonWithRetry(url: string, init: RequestInit, attempts = 3) {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (response.ok) {
        return await response.json();
      }
      const body = await response.text().catch(() => "");
      if (response.status >= 500 && attempt < attempts) {
        const backoff = Math.min(2000, 300 * Math.pow(2, attempt - 1));
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }
      throw new Error(`HTTP ${response.status}: ${body || "request failed"}`);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;
      const backoff = Math.min(2000, 300 * Math.pow(2, attempt - 1));
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Request failed");
}

async function getGoogleAccessToken() {
  const staticAccessToken = Deno.env.get("GOOGLE_ACCESS_TOKEN") || Deno.env.get("APP_GOOGLE_ACCESS_TOKEN");
  if (staticAccessToken) return staticAccessToken;

  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN") || Deno.env.get("APP_GOOGLE_REFRESH_TOKEN");
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID") || Deno.env.get("APP_GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") || Deno.env.get("APP_GOOGLE_CLIENT_SECRET");

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error("Missing Google OAuth credentials (GOOGLE_REFRESH_TOKEN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)");
  }

  const payload = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const tokenResponse = await fetchJsonWithRetry(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: payload.toString(),
  });

  if (!tokenResponse?.access_token) {
    throw new Error("Google token endpoint did not return access_token");
  }

  return String(tokenResponse.access_token);
}

function buildGoogleEventBody(event: CalendarEventInput) {
  const recurrenceRRule = recurrenceToRRule(event.recurrence);
  return {
    summary: event.title,
    description: event.description,
    start: {
      dateTime: event.start,
      timeZone: event.timezone,
    },
    end: {
      dateTime: event.end,
      timeZone: event.timezone,
    },
    recurrence: recurrenceRRule ? [recurrenceRRule] : undefined,
  };
}

export async function createCalendarEvent(event: CalendarEventInput): Promise<CalendarEventResult> {
  const calendarId =
    Deno.env.get("GOOGLE_CALENDAR_ID") ||
    Deno.env.get("APP_GOOGLE_CALENDAR_ID") ||
    "primary";
  const accessToken = await getGoogleAccessToken();

  const payload = await fetchJsonWithRetry(
    `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildGoogleEventBody(event)),
    }
  );

  if (!payload?.id) {
    throw new Error("Google Calendar create event response missing id");
  }

  return {
    eventId: String(payload.id),
    htmlLink: payload.htmlLink ? String(payload.htmlLink) : null,
  };
}

export async function updateCalendarEvent(eventId: string, event: CalendarEventInput): Promise<CalendarEventResult> {
  const calendarId =
    Deno.env.get("GOOGLE_CALENDAR_ID") ||
    Deno.env.get("APP_GOOGLE_CALENDAR_ID") ||
    "primary";
  const accessToken = await getGoogleAccessToken();

  const payload = await fetchJsonWithRetry(
    `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildGoogleEventBody(event)),
    }
  );

  if (!payload?.id) {
    throw new Error("Google Calendar update event response missing id");
  }

  return {
    eventId: String(payload.id),
    htmlLink: payload.htmlLink ? String(payload.htmlLink) : null,
  };
}
