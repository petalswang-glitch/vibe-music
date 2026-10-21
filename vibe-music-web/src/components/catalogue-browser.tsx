"use client";

import { Pagination } from "@/components/pagination";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, Search } from "lucide-react";
import { useState, type FormEvent } from "react";

import { CoverImage } from "@/components/cover-image";
import { postApi } from "@/lib/api-client";
import type { Artist, Page, Playlist } from "@/types/catalogue";
import { useAuth } from "@/providers/auth-provider";
import { AuthDialog } from "@/components/auth-dialog";
import { viewerKey } from "@/lib/favorite-cache";

const genres = [
  "全部",
  "节奏布鲁斯",
  "欧美流行",
  "华语流行",
  "粤语流行",
  "国风流行",
  "韩语流行",
  "日本流行",
  "嘻哈说唱",
  "非洲节拍",
  "原声带",
  "轻音乐",
  "摇滚",
  "朋克",
  "电子",
  "国风",
  "乡村",
  "古典",
];
const regions = ["全部", "中国", "美国", "韩国", "日本", "其他"];
const genderLabels = ["全部", "男歌手", "女歌手", "组合/乐队"];

export function CatalogueBrowser({ kind }: { kind: "artist" | "playlist" }) {
  const { user, ready } = useAuth();
  const [favorite, setFavorite] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const isArtist = kind === "artist";
  const title = isArtist ? "歌手" : "歌单";
  const [draft, setDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [gender, setGender] = useState(-1);
  const [area, setArea] = useState("全部");
  const [style, setStyle] = useState("全部");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(12);
  const result = useQuery({
    queryKey: [
      favorite ? "favorite" : kind,
      favorite ? "playlists" : "list",
      keyword,
      gender,
      area,
      style,
      page,
      size,
      viewerKey(user?.userId),
    ],
    queryFn: ({ signal }) =>
      postApi<Page<Artist | Playlist>>(
        isArtist
          ? "/artist/getAllArtists"
          : favorite
            ? "/favorite/getFavoritePlaylists"
            : "/playlist/getAllPlaylists",
        isArtist
          ? {
              pageNum: page,
              pageSize: size,
              artistName: keyword || null,
              gender: gender === -1 ? null : gender,
              // The legacy "其他" category sends null; keep its existing API behavior.
              area: area === "全部" || area === "其他" ? null : area,
            }
          : {
              pageNum: page,
              pageSize: size,
              title: keyword || null,
              style: style === "全部" ? null : style,
            },
        signal,
      ),
    enabled: ready && (!favorite || Boolean(user)),
  });

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setKeyword(draft);
  }
  function reset() {
    setDraft("");
    setKeyword("");
    setGender(-1);
    setArea("全部");
    setStyle("全部");
    setPage(1);
  }

  return (
    <section
      className="mx-auto w-full max-w-6xl"
      aria-labelledby={`${kind}-title`}
    >
      <h1
        id={`${kind}-title`}
        className="mb-7 font-serif-display text-3xl font-semibold"
      >
        {title}
      </h1>
      {!isArtist && (
        <div
          role="tablist"
          aria-label="歌单分类"
          className="mb-6 flex gap-5 border-b"
        >
          {[false, true].map((value) => (
            <button
              key={String(value)}
              role="tab"
              aria-selected={favorite === value}
              onClick={() => {
                setFavorite(value);
                setPage(1);
                if (value && !user) setAuthOpen(true);
              }}
              className={`border-b-2 px-2 py-3 text-sm ${favorite === value ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
            >
              {value ? "我的收藏" : "精选歌单"}
            </button>
          ))}
        </div>
      )}
      {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} />}
      <div className="flex flex-col gap-8 lg:flex-row">
        <aside
          className={
            isArtist ? "w-full shrink-0 lg:w-56" : "w-full shrink-0 lg:w-64"
          }
        >
          <div className="mb-5 flex justify-between">
            <h2 className="font-medium">{title}分类</h2>
            <button
              onClick={reset}
              className="text-sm text-muted-foreground hover:text-primary"
            >
              重置
            </button>
          </div>
          <form
            onSubmit={search}
            role="search"
            className="mb-5 flex items-center gap-2 rounded-lg border bg-card px-3 py-2"
          >
            <Search
              size={16}
              aria-hidden="true"
              className="shrink-0 text-muted-foreground"
            />
            <input
              aria-label={`搜索${title}`}
              placeholder={`搜索${title}...`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            <button type="submit" className="text-sm text-primary">
              搜索
            </button>
          </form>
          {isArtist ? (
            <>
              <details open className="mb-3">
                <summary className="cursor-pointer py-2 text-sm font-medium">
                  歌手类型
                </summary>
                <div className="flex flex-wrap gap-1 lg:flex-col">
                  {genderLabels.map((label, index) => (
                    <button
                      key={label}
                      aria-pressed={gender === index - 1}
                      onClick={() => {
                        setGender(index - 1);
                        setPage(1);
                      }}
                      className={`rounded-lg px-4 py-2 text-left text-sm ${gender === index - 1 ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </details>
              <details open>
                <summary className="cursor-pointer py-2 text-sm font-medium">
                  地区类型
                </summary>
                <div className="flex flex-wrap gap-1 lg:flex-col">
                  {regions.map((region) => (
                    <button
                      key={region}
                      aria-pressed={area === region}
                      onClick={() => {
                        setArea(region);
                        setPage(1);
                      }}
                      className={`rounded-lg px-4 py-2 text-left text-sm ${area === region ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                    >
                      {region}
                    </button>
                  ))}
                </div>
              </details>
            </>
          ) : (
            <label className="flex flex-col gap-2 text-sm">
              歌单风格
              <select
                value={style}
                onChange={(event) => {
                  setStyle(event.target.value);
                  setPage(1);
                }}
                className="rounded-lg border bg-card px-3 py-2"
              >
                {genres.map((genre) => (
                  <option key={genre}>{genre}</option>
                ))}
              </select>
            </label>
          )}
        </aside>

        <div className="min-w-0 flex-1" aria-busy={result.isFetching}>
          {favorite && !user ? (
            <div className="py-20 text-center text-sm text-muted-foreground">
              <p>请登录查看收藏歌单</p>
              <button
                onClick={() => setAuthOpen(true)}
                className="mt-4 rounded-lg bg-primary px-5 py-2 text-white"
              >
                登录 / 注册
              </button>
            </div>
          ) : result.isPending ? (
            <div
              role="status"
              className="flex min-h-64 items-center justify-center gap-2 text-muted-foreground"
            >
              <LoaderCircle size={20} className="animate-spin" />
              正在加载{title}...
            </div>
          ) : result.isError ? (
            <div
              role="alert"
              className="flex min-h-64 flex-col items-center justify-center gap-4"
            >
              <p>暂时无法加载{title}</p>
              <button
                onClick={() => void result.refetch()}
                className="rounded-lg bg-primary px-5 py-2 text-sm text-white"
              >
                重新加载
              </button>
            </div>
          ) : !result.data.items?.length ? (
            <div
              role="status"
              className="flex min-h-64 items-center justify-center text-muted-foreground"
            >
              未找到相关{title}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 xl:grid-cols-4">
              {result.data.items.map((item) => {
                const artist = "artistId" in item;
                const id = artist ? item.artistId : item.playlistId;
                const name = artist ? item.artistName : item.title;
                return (
                  <Link
                    key={id}
                    href={`/${kind}/${id}`}
                    className="group block min-w-0 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <div className="transition-transform duration-300 group-hover:-translate-y-1">
                      <CoverImage
                        src={artist ? item.avatar : item.coverUrl}
                        alt={name}
                        round={artist}
                      />
                    </div>
                    <h2
                      className={`mt-3 truncate text-sm font-medium group-hover:text-primary ${artist ? "text-center" : ""}`}
                    >
                      {name}
                    </h2>
                  </Link>
                );
              })}
            </div>
          )}
          {!result.isPending && !result.isError && (
            <Pagination
              label={`${title}分页`}
              total={result.data.total}
              page={page}
              size={size}
              sizes={[12, 24, 36, 48]}
              busy={result.isFetching}
              onPage={setPage}
              onSize={(value) => {
                setSize(value);
                setPage(1);
              }}
            />
          )}
        </div>
      </div>
    </section>
  );
}
