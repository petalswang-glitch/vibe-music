export type ManagedArtist = {
  artistId: number;
  artistName: string;
  avatar: string | null;
  gender: number | null;
  birth: string | null;
  area: string | null;
  introduction: string | null;
};
export type ArtistValues = {
  artistName: string;
  gender: string;
  birth: string;
  area: string;
  introduction: string;
};
export function artistPayload(values: ArtistValues, artistId?: number) {
  return {
    ...(artistId === undefined ? {} : { artistId }),
    artistName: values.artistName,
    gender: values.gender === "" ? null : Number(values.gender),
    birth: values.birth || null,
    area: values.area,
    introduction: values.introduction,
  };
}
export function artistGender(value: number | null) {
  return value === 0
    ? "男歌手"
    : value === 1
      ? "女歌手"
      : value === 2
        ? "组合/乐队"
        : "未知";
}
