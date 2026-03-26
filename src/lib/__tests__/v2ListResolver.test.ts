import { describe, expect, it } from "vitest";
import { resolveCachedClickUpListByName } from "../../../supabase/functions/lib/v2-list-resolver";

function createSupabaseStub() {
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq(_column: string, _value: string) {
              if (table === "clickup_spaces") {
                return Promise.resolve({
                  data: [
                    { clickup_space_id: "space-1", name: "Global Payments", user_id: "user-1" },
                    { clickup_space_id: "space-2", name: "Other Space", user_id: "user-1" },
                  ],
                });
              }

              if (table === "clickup_lists") {
                return Promise.resolve({
                  data: [
                    { clickup_list_id: "list-1", title: "Genius POS Leads", space_id: "space-1", user_id: "user-1" },
                    { clickup_list_id: "list-2", title: "Tasks", space_id: "space-1", user_id: "user-1" },
                    { clickup_list_id: "list-3", title: "Genius POS Leads", space_id: "space-2", user_id: "user-1" },
                  ],
                });
              }

              return Promise.resolve({ data: [] });
            },
          };
        },
      };
    },
  };
}

describe("resolveCachedClickUpListByName", () => {
  it("resolves a list by exact name within the specified space", async () => {
    const result = await resolveCachedClickUpListByName(
      createSupabaseStub() as any,
      "user-1",
      "Genius POS Leads",
      "Global Payments"
    );

    expect(result?.clickup_list_id).toBe("list-1");
  });

  it("returns null when the list is ambiguous without a space name", async () => {
    const result = await resolveCachedClickUpListByName(
      createSupabaseStub() as any,
      "user-1",
      "Genius POS Leads"
    );

    expect(result).toBeNull();
  });
});
