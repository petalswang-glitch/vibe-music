export const dashboardStyles = [
  "欧美流行",
  "华语流行",
  "粤语流行",
  "韩国流行",
  "古典",
  "嘻哈说唱",
  "摇滚",
  "电子",
  "节奏布鲁斯",
  "轻音乐",
] as const;
export const dashboardAreas = [
  "美国",
  "中国",
  "韩国",
  "日本",
  "德国",
  "英国",
] as const;
export type Distribution = { name: string; value: number }[];
export type DashboardCounts = {
  totals: { users: number; artists: number; songs: number; playlists: number };
  styles: Distribution;
  areas: Distribution;
  genders: Distribution;
};

// Keep the source's 22 real count requests and their distinct filter semantics.
export async function fetchDashboardCounts(
  get: (path: string, signal?: AbortSignal) => Promise<number>,
  signal?: AbortSignal,
): Promise<DashboardCounts> {
  const paths = [
    "/admin/getAllUsersCount",
    "/admin/getAllArtistsCount",
    "/admin/getAllSongsCount",
    "/admin/getAllPlaylistsCount",
    ...dashboardStyles.map(
      (style) => `/admin/getAllSongsCount?style=${encodeURIComponent(style)}`,
    ),
    ...dashboardAreas.map(
      (area) => `/admin/getAllArtistsCount?area=${encodeURIComponent(area)}`,
    ),
    "/admin/getAllArtistsCount?gender=0",
    "/admin/getAllArtistsCount?gender=1",
  ];
  const values = await Promise.all(
    paths.map(async (path) => {
      const value = await get(path, signal);
      if (
        typeof value !== "number" ||
        !Number.isSafeInteger(value) ||
        value < 0
      )
        throw new Error("统计数据无效，请重试");
      return value;
    }),
  );
  return {
    totals: {
      users: values[0],
      artists: values[1],
      songs: values[2],
      playlists: values[3],
    },
    styles: dashboardStyles.map((name, index) => ({
      name,
      value: values[4 + index],
    })),
    areas: dashboardAreas.map((name, index) => ({
      name,
      value: values[14 + index],
    })),
    genders: [
      { name: "男", value: values[20] },
      { name: "女", value: values[21] },
    ],
  };
}
