export type ManagedPlaylist = {
  playlistId: number;
  title: string;
  coverUrl: string | null;
  style: string | null;
  introduction: string | null;
};
export type PlaylistValues = {
  title: string;
  style: string;
  introduction: string;
};
export function playlistPayload(values: PlaylistValues, playlistId?: number) {
  return {
    title: values.title,
    style: values.style,
    introduction: values.introduction,
    ...(playlistId === undefined ? {} : { playlistId }),
  };
}
