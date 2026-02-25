export const CLICKUP_API_BASE = "https://api.clickup.com/api/v2";

export interface ClickUpSpace {
  id: number | string;
  name?: string;
  description?: string;
  status?: string;
  archived?: boolean;
}

export interface ClickUpList {
  id: number | string;
  name?: string;
  content?: string;
  status?: string;
  instructions?: string;
  preferences?: string;
}

interface ClickUpFolder {
  id: number | string;
  name?: string;
}

export async function syncClickUpConfiguration(
  supabase: any,
  apiKey: string,
  userId: string
) {
  const syncedWorkspaces: Array<{
    clickup_workspace_id: string;
    name?: string | null;
    metadata: Record<string, any>;
  }> = [];

  try {
    let spacesSynced = 0;
    let listsSynced = 0;
    const preferredWorkspaceId = Deno.env.get("APP_CLICKUP_WORKSPACE_ID")?.trim() || null;
    const preferredWorkspaceName = (Deno.env.get("APP_CLICKUP_WORKSPACE_NAME") || "Life OS").trim().toLowerCase();
    if (!preferredWorkspaceId && !preferredWorkspaceName) {
      throw new Error("Set APP_CLICKUP_WORKSPACE_ID or APP_CLICKUP_WORKSPACE_NAME for single-workspace sync mode.");
    }
    const teams = await fetchClickUpTeams(apiKey);
    if (!teams.length) {
      throw new Error("ClickUp returned zero teams. Verify CLICKUP_API_KEY, workspace access, and account permissions.");
    }

    const selectedTeam =
      (preferredWorkspaceId
        ? teams.find((team) => String(team.id) === preferredWorkspaceId)
        : null) ||
      (preferredWorkspaceName
        ? teams.find((team) => (team.name || "").trim().toLowerCase() === preferredWorkspaceName)
        : null);

    if (!selectedTeam) {
      throw new Error(
        preferredWorkspaceId
          ? `Could not find configured ClickUp workspace ${preferredWorkspaceId}. Verify APP_CLICKUP_WORKSPACE_ID or set APP_CLICKUP_WORKSPACE_NAME.`
          : `Could not find configured ClickUp workspace named "${preferredWorkspaceName}". Verify APP_CLICKUP_WORKSPACE_NAME.`
      );
    }

    for (const team of [selectedTeam]) {
      const workspaceId = String(team.id);
      const workspacePayload = {
        clickup_workspace_id: workspaceId,
        name: team.name || null,
        metadata: {
          synced_at: new Date().toISOString(),
          single_tenant_target: true
        },
        user_id: userId
      };

      await supabase
        .from("clickup_workspaces")
        .upsert(workspacePayload, { onConflict: "clickup_workspace_id" });

      syncedWorkspaces.push(workspacePayload);

      const spaces = await fetchClickUpSpaces(team.id, apiKey);
      for (const space of spaces) {
        if (!space.id || space.archived || space.status === "archived") continue;

        const spaceId = String(space.id);
        const spacePayload = {
          clickup_space_id: spaceId,
          name: space.name || null,
          workspace_id: workspaceId,
          user_id: userId,
          metadata: { synced_at: new Date().toISOString() }
        };

        await supabase
          .from("clickup_spaces")
          .upsert(spacePayload, { onConflict: "clickup_space_id" });
        spacesSynced += 1;

        const directLists = await fetchClickUpLists(space.id, apiKey);
        const folders = await fetchClickUpFolders(space.id, apiKey);
        const folderListResults = await Promise.all(
          folders.map(async (folder) => {
            const lists = await fetchClickUpFolderLists(folder.id, apiKey);
            return {
              folder_id: String(folder.id),
              folder_name: folder.name || null,
              list_count: lists.length,
              lists,
            };
          })
        );
        const folderLists = folderListResults.map((entry) => entry.lists);
        console.log(
          "Sync raw list diagnostics",
          JSON.stringify({
            workspace_id: workspaceId,
            space_id: spaceId,
            space_name: space.name || null,
            space_list_count: directLists.length,
            folder_count: folders.length,
            folder_list_counts: folderListResults.map((entry) => ({
              folder_id: entry.folder_id,
              folder_name: entry.folder_name,
              list_count: entry.list_count,
            })),
          })
        );
        const dedupedLists = Array.from(
          new Map(
            [...directLists, ...folderLists.flat()]
              .filter((list) => Boolean(list?.id))
              .map((list) => [String(list.id), list])
          ).values()
        );
        console.log(
          "Sync space lists",
          JSON.stringify({
            workspace_id: workspaceId,
            space_id: spaceId,
            space_name: space.name || null,
            direct_lists: directLists.length,
            folders: folders.length,
            folder_lists: folderLists.flat().length,
            merged_lists: dedupedLists.length
          })
        );
        for (const list of dedupedLists) {
          if (!list.id || list.status === "archived") continue;
          const persisted = await ensureClickUpList(supabase, list, spaceId, userId);
          if (persisted) {
            listsSynced += 1;
          }
        }
      }

      // CLEANUP: Delete spaces/lists that no longer exist in ClickUp
      const currentSpaceIds = spaces
        .filter(space => !space.archived && space.status !== "archived")
        .map(space => String(space.id));
      
      const currentListIds = new Set<string>();
      for (const space of spaces) {
        if (space.archived || space.status === "archived") continue;
        
        const directLists = await fetchClickUpLists(space.id, apiKey);
        const folders = await fetchClickUpFolders(space.id, apiKey);
        const folderListResults = await Promise.all(
          folders.map(async (folder) => {
            const lists = await fetchClickUpFolderLists(folder.id, apiKey);
            return lists;
          })
        );
        const allLists = [...directLists, ...folderListResults.flat()]
          .filter(list => list.id && list.status !== "archived");
        
        allLists.forEach(list => currentListIds.add(String(list.id)));
      }

      // Delete spaces that no longer exist in ClickUp
      await supabase
        .from("clickup_spaces")
        .delete()
        .eq("user_id", userId)
        .eq("workspace_id", workspaceId)
        .not("clickup_space_id", "in", currentSpaceIds.length ? currentSpaceIds : ["__none__"]);

      // Delete lists that no longer exist in ClickUp
      if (currentListIds.size > 0) {
        await supabase
          .from("clickup_lists")
          .delete()
          .eq("user_id", userId)
          .not("clickup_list_id", "in", Array.from(currentListIds));
      } else {
        // If no lists exist, delete all lists for this workspace
        await supabase
          .from("clickup_lists")
          .delete()
          .eq("user_id", userId)
          .in("space_id", currentSpaceIds.length ? currentSpaceIds : ["__none__"]);
      }

      // Enforce single-workspace scope in cached tables.
      await supabase
        .from("clickup_spaces")
        .delete()
        .eq("user_id", userId)
        .neq("workspace_id", workspaceId);

      await supabase
        .from("clickup_workspaces")
        .delete()
        .eq("user_id", userId)
        .neq("clickup_workspace_id", workspaceId);
    }
    return {
      workspaces: syncedWorkspaces,
      selected_workspace_id: String(selectedTeam.id),
      selected_workspace_name: selectedTeam.name || null,
      spaces_synced: spacesSynced,
      lists_synced: listsSynced,
    };
  } catch (error) {
    console.error("ClickUp sync failed", error);
    throw error;
  }
}

async function fetchClickUpTeams(apiKey: string): Promise<{ id: string | number; name?: string }[]> {
  try {
    const response = await fetch(`${CLICKUP_API_BASE}/team`, {
      headers: {
        Authorization: apiKey
      }
    });
    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(`ClickUp team fetch failed (${response.status}): ${details || "no response body"}`);
    }
    const payload = await response.json();
    const teams = payload?.teams;
    if (Array.isArray(teams) && teams.length) {
      return teams.map((team: any) => ({ id: team.id, name: team.name }));
    }
    return payload?.team ? [{ id: payload.team.id, name: payload.team.name }] : [];
  } catch (error) {
    console.error("ClickUp team fetch error", error);
    throw error;
  }
}

async function fetchClickUpSpaces(teamId: string | number, apiKey: string): Promise<ClickUpSpace[]> {
  try {
    const response = await fetch(`${CLICKUP_API_BASE}/team/${teamId}/space?archived=false`, {
      headers: {
        Authorization: apiKey
      }
    });
    if (!response.ok) {
      console.error("ClickUp spaces fetch failed", response.status);
      return [];
    }
    const payload = await response.json();
    return payload?.spaces || [];
  } catch (error) {
    console.error("ClickUp spaces fetch error", error);
    return [];
  }
}

async function fetchClickUpLists(spaceId: string | number, apiKey: string): Promise<ClickUpList[]> {
  try {
    const response = await fetch(`${CLICKUP_API_BASE}/space/${spaceId}/list?archived=false`, {
      headers: {
        Authorization: apiKey
      }
    });
    if (!response.ok) {
      const details = await response.text().catch(() => "");
      console.error("ClickUp lists fetch failed", response.status, details);
      return [];
    }
    const payload = await response.json();
    return payload?.lists || [];
  } catch (error) {
    console.error("ClickUp lists fetch error", error);
    return [];
  }
}

async function fetchClickUpFolders(spaceId: string | number, apiKey: string): Promise<ClickUpFolder[]> {
  try {
    const response = await fetch(`${CLICKUP_API_BASE}/space/${spaceId}/folder?archived=false`, {
      headers: {
        Authorization: apiKey
      }
    });
    if (!response.ok) {
      const details = await response.text().catch(() => "");
      // Some spaces have no folders endpoint data; treat 404 as empty.
      if (response.status === 404) {
        return [];
      }
      console.error("ClickUp folders fetch failed", response.status, details);
      return [];
    }
    const payload = await response.json();
    return payload?.folders || [];
  } catch (error) {
    console.error("ClickUp folders fetch error", error);
    return [];
  }
}

async function fetchClickUpFolderLists(folderId: string | number, apiKey: string): Promise<ClickUpList[]> {
  try {
    const response = await fetch(`${CLICKUP_API_BASE}/folder/${folderId}/list?archived=false`, {
      headers: {
        Authorization: apiKey
      }
    });
    if (!response.ok) {
      const details = await response.text().catch(() => "");
      console.error("ClickUp folder lists fetch failed", response.status, details);
      return [];
    }
    const payload = await response.json();
    return payload?.lists || [];
  } catch (error) {
    console.error("ClickUp folder lists fetch error", error);
    return [];
  }
}

async function ensureClickUpList(
  supabase: any,
  list: ClickUpList,
  spaceId: string,
  userId: string
) {
  const listId = String(list.id);
  const { data: existing } = await supabase
    .from("clickup_lists")
    .select("id")
    .eq("user_id", userId)
    .or(`clickup_list_id.eq.${listId},list_id.eq.${listId}`)
    .maybeSingle();

  const sourceName = (list.name || "").trim() || "ClickUp list";
  const uniqueReferenceName = `${spaceId}:${sourceName}`;
  const payload = {
    title: sourceName,
    reference_name: uniqueReferenceName,
    list_id: listId,
    clickup_list_id: listId,
    context: list.content || null,
    space_id: spaceId,
    metadata: {
      synced_at: new Date().toISOString(),
      space_id: spaceId,
      source_name: sourceName
    },
    updated_at: new Date().toISOString(),
    instructions: list.instructions || null,
    goals: []
  };

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from("clickup_lists")
      .update(payload)
      .eq("id", existing.id);
    if (updateError) {
      console.error("Update clickup list failed", updateError);
      return null;
    }
    return existing.id;
  }

  const { error } = await supabase
    .from("clickup_lists")
    .insert({
      ...payload,
      user_id: userId
    });

  if (error) {
    console.error("Insert clickup list failed", error);
    return null;
  }
  return listId;
}
