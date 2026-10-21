"use client";

import {
  Bot,
  LoaderCircle,
  MessageCirclePlus,
  Music2,
  Play,
  Send,
  Square,
  X,
} from "lucide-react";
import { memo, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import { viewerKey } from "@/lib/favorite-cache";
import type { AgentConfiguration } from "@/lib/agent-config";
import { CoverImage } from "@/components/cover-image";
import {
  getApi,
  getBrowserSessionRevision,
  getBrowserToken,
} from "@/lib/api-client";
import {
  loadConversation,
  newConversationId,
  parseAgentContent,
  saveConversation,
} from "@/lib/agent-content";
import { renderAgentMarkdown } from "@/lib/agent-markdown";
import { streamAgentChat } from "@/lib/agent-stream";
import { mediaUrl } from "@/lib/media-url";
import { usePlayer } from "@/providers/player-provider";
import type { Song } from "@/types/song";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  loading?: boolean;
  error?: string;
  stopped?: boolean;
};
const suggestions = [
  "推荐几首摇滚歌曲",
  "心情低落的时候听什么好？",
  "有哪些好听的流行歌",
];

export function AgentPanel({
  open,
  onClose,
  viewer,
}: {
  open: boolean;
  onClose: () => void;
  viewer: string;
}) {
  const { user } = useAuth();
  const configuration = useQuery({
    queryKey: ["agent-config", viewerKey(user?.userId)],
    queryFn: ({ signal }) =>
      getApi<AgentConfiguration>("/user/agent-config", signal),
    enabled: Boolean(user),
  });
  const canSend = Boolean(
    user && configuration.data?.configured && !configuration.isError,
  );
  const [conversation, setConversation] = useState(() =>
    loadConversation(viewer),
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const playbackRequest = useRef<AbortController | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const playSong = usePlayer((state) => state.playSong);

  useEffect(
    () => () => {
      request.current?.abort();
      playbackRequest.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (open && list.current)
      list.current.scrollTop = list.current.scrollHeight;
  }, [messages, open]);
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open, onClose]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || request.current || !canSend) return;
    const controller = new AbortController();
    request.current = controller;
    const revision = getBrowserSessionRevision();
    const id = newConversationId();
    const current = () =>
      request.current === controller &&
      !controller.signal.aborted &&
      revision === getBrowserSessionRevision();
    setInput("");
    setNotice(null);
    setStreaming(true);
    setMessages((previous) => [
      ...previous,
      { id: newConversationId(), role: "user", content: text },
      { id, role: "assistant", content: "", loading: true },
    ]);
    try {
      await streamAgentChat(
        conversation,
        text,
        (delta) => {
          if (current())
            setMessages((previous) =>
              previous.map((message) =>
                message.id === id
                  ? { ...message, content: message.content + delta }
                  : message,
              ),
            );
        },
        {
          token: getBrowserToken(),
          signal: controller.signal,
          onUnauthorized: () => {
            if (current()) window.dispatchEvent(new Event("vibe-auth-expired"));
          },
        },
      );
    } catch (error) {
      if (current())
        setMessages((previous) =>
          previous.map((message) =>
            message.id === id
              ? {
                  ...message,
                  error:
                    error instanceof Error
                      ? error.message
                      : "请求失败，请稍后重试",
                }
              : message,
          ),
        );
    } finally {
      if (request.current === controller) {
        request.current = null;
        setStreaming(false);
        setMessages((previous) =>
          previous.map((message) =>
            message.id === id
              ? {
                  ...message,
                  loading: false,
                  stopped: controller.signal.aborted,
                }
              : message,
          ),
        );
      }
    }
  }

  function stop() {
    request.current?.abort();
  }
  function reset() {
    request.current?.abort();
    request.current = null;
    playbackRequest.current?.abort();
    playbackRequest.current = null;
    const id = newConversationId();
    saveConversation(viewer, id);
    setConversation(id);
    setMessages([]);
    setInput("");
    setStreaming(false);
    setNotice(null);
    setPlayingId(null);
    inputRef.current?.focus();
  }
  async function play(song: Song) {
    playbackRequest.current?.abort();
    const controller = new AbortController();
    playbackRequest.current = controller;
    const revision = getBrowserSessionRevision();
    setPlayingId(song.songId);
    setNotice(null);
    try {
      const detail = await getApi<Song | null>(
        `/song/getSongDetail/${song.songId}`,
        controller.signal,
      );
      if (controller.signal.aborted || revision !== getBrowserSessionRevision())
        return;
      if (!detail || !mediaUrl(detail.audioUrl)) {
        setNotice("该歌曲暂无播放资源");
        return;
      }
      playSong(detail);
    } catch (error) {
      if (
        !controller.signal.aborted &&
        revision === getBrowserSessionRevision()
      )
        setNotice(error instanceof Error ? error.message : "播放失败，请重试");
    } finally {
      if (playbackRequest.current === controller) {
        playbackRequest.current = null;
        setPlayingId(null);
      }
    }
  }

  return (
    <section
      hidden={!open}
      aria-label="VibeAgent 音乐助手"
      className="fixed bottom-24 right-6 z-[100] flex h-[560px] max-h-[calc(100dvh-9rem)] w-[400px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border bg-background shadow-xl"
      style={open ? undefined : { display: "none" }}
    >
      <header className="flex shrink-0 items-center gap-2.5 border-b px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Bot size={22} aria-hidden="true" />
        </span>
        <div className="leading-tight">
          <h2 className="font-serif-display font-bold tracking-tight">
            VibeAgent
          </h2>
          <p className="text-xs text-muted-foreground">你的私人音乐向导</p>
        </div>
        <div className="ml-auto flex gap-1">
          <button
            type="button"
            onClick={reset}
            title="新会话"
            aria-label="新会话"
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-primary"
          >
            <MessageCirclePlus size={19} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭 VibeAgent"
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-primary"
          >
            <X size={19} />
          </button>
        </div>
      </header>
      <div
        ref={list}
        role="log"
        aria-label="聊天记录"
        aria-live="polite"
        className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center gap-4 pt-6 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Music2 size={30} aria-hidden="true" />
            </span>
            <div>
              <p className="font-serif-display text-lg font-bold">
                Hi，想听点什么？
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                告诉我你的心情、风格或歌手，我来为你推荐音乐
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 px-3 sm:px-6">
              {suggestions.map((suggestion) => (
                <button
                  type="button"
                  key={suggestion}
                  onClick={() => {
                    setInput(suggestion);
                    inputRef.current?.focus();
                  }}
                  className="rounded-full border border-primary/30 px-3 py-1.5 text-sm text-primary transition-colors hover:bg-primary hover:text-white"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            playingId={playingId}
            onPlay={play}
          />
        ))}
      </div>
      <footer className="shrink-0 border-t px-4 py-3">
        {!canSend && (
          <p role="status" className="mb-2 text-xs text-muted-foreground">
            {configuration.isPending ? (
              "正在检查个人配置…"
            ) : configuration.isError ? (
              "暂时无法读取个人配置，请稍后重试。"
            ) : (
              <>
                请先
                <Link
                  href="/user#agent-settings"
                  onClick={onClose}
                  className="text-primary underline"
                >
                  配置你自己的模型 API Key
                </Link>
                ，调用费用由你的模型账号承担。
              </>
            )}
          </p>
        )}
        {notice && (
          <p role="alert" className="mb-2 text-xs text-destructive">
            {notice}
          </p>
        )}
        <form
          onSubmit={send}
          className="flex items-center gap-2 rounded-xl border px-3 py-1.5 focus-within:ring-2 focus-within:ring-primary/50"
        >
          <input
            ref={inputRef}
            aria-label="告诉我你想听什么"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            maxLength={8000}
            disabled={!canSend}
            onKeyDown={(event) => {
              if (event.key === "Enter" && event.nativeEvent.isComposing)
                event.preventDefault();
            }}
            placeholder="告诉我你想听什么..."
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {streaming ? (
            <button
              type="button"
              aria-label="停止生成"
              onClick={stop}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-white"
            >
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button
              type="submit"
              aria-label="发送"
              disabled={!input.trim() || !canSend}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send size={17} />
            </button>
          )}
        </form>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
          VibeAgent · 歌曲卡片来自真实曲库
        </p>
      </footer>
    </section>
  );
}

const ChatMessage = memo(function ChatMessage({
  message,
  playingId,
  onPlay,
}: {
  message: Message;
  playingId: number | null;
  onPlay: (song: Song) => void;
}) {
  if (message.role === "user")
    return (
      <div className="flex justify-end">
        <p className="max-w-[80%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm leading-relaxed text-white">
          {message.content}
        </p>
      </div>
    );
  const content = parseAgentContent(message.content);
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Bot size={18} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="rounded-2xl rounded-tl-md bg-muted/50 px-4 py-2.5 text-sm leading-relaxed">
          {!message.content && message.loading ? (
            <span>正在思考…</span>
          ) : (
            <div
              className="vibe-md"
              dangerouslySetInnerHTML={{
                __html: renderAgentMarkdown(content.text),
              }}
            />
          )}
          {message.loading && message.content && (
            <span className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <LoaderCircle
                size={12}
                className="animate-spin motion-reduce:animate-none"
              />
              正在生成…
            </span>
          )}
          {message.error && (
            <p role="alert" className="mt-1 text-xs text-destructive">
              {message.error}
            </p>
          )}
          {message.stopped && (
            <p className="mt-1 text-xs text-muted-foreground">已停止生成</p>
          )}
        </div>
        {content.songs.length > 0 && (
          <div className="max-h-56 space-y-2 overflow-y-auto">
            {content.songs.map((song) => (
              <button
                type="button"
                key={song.songId}
                aria-label={`播放 ${song.songName}`}
                disabled={playingId === song.songId}
                onClick={() => onPlay(song)}
                className="group flex w-full items-center gap-3 rounded-xl border bg-background p-2 text-left transition-colors hover:border-primary/40 disabled:opacity-60"
              >
                <span className="w-10 shrink-0">
                  <CoverImage src={song.coverUrl} alt={song.songName} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {song.songName}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {song.artistName || "未知歌手"} · {song.album}
                  </span>
                </span>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                  {playingId === song.songId ? (
                    <LoaderCircle size={16} className="animate-spin" />
                  ) : (
                    <Play size={16} fill="currentColor" />
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
