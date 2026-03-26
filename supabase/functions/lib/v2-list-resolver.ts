type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => any;
  };
};

export type ResolvedCachedList = {
  clickup_list_id: string;
  title: string;
  space_id: string | null;
  space_name: string | null;
};

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function resolveCachedClickUpListByName(
  supabase: SupabaseLike,
  userId: string,
  listName: string,
  spaceName?: string | null
): Promise<ResolvedCachedList | null> {
  const normalizedListName = normalizeName(listName);
  const normalizedSpaceName = spaceName ? normalizeName(spaceName) : null;

  const { data: spaces } = await supabase
    .from("clickup_spaces")
    .select("clickup_space_id,name,user_id")
    .eq("user_id", userId);

  const allowedSpaceIds = normalizedSpaceName
    ? (spaces || [])
        .filter((space: any) => normalizeName(String(space?.name || "")) === normalizedSpaceName)
        .map((space: any) => String(space.clickup_space_id))
    : null;

  const { data: lists } = await supabase
    .from("clickup_lists")
    .select("clickup_list_id,title,space_id,user_id")
    .eq("user_id", userId);

  const hydratedLists = (lists || []).map((list: any) => {
    const matchingSpace = (spaces || []).find(
      (space: any) => String(space?.clickup_space_id || "") === String(list?.space_id || "")
    );

    return {
      clickup_list_id: String(list?.clickup_list_id || ""),
      title: String(list?.title || ""),
      space_id: list?.space_id ? String(list.space_id) : null,
      space_name: matchingSpace?.name ? String(matchingSpace.name) : null,
    };
  });

  const scopedLists = allowedSpaceIds?.length
    ? hydratedLists.filter((list) => list.space_id && allowedSpaceIds.includes(list.space_id))
    : hydratedLists;

  const exactMatches = scopedLists.filter(
    (list) => normalizeName(list.title) === normalizedListName
  );
  if (exactMatches.length === 1) return exactMatches[0];

  const partialMatches = scopedLists.filter((list) =>
    normalizeName(list.title).includes(normalizedListName)
  );
  if (partialMatches.length === 1) return partialMatches[0];

  return null;
}
