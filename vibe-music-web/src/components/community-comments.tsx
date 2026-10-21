"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, ThumbsUp, Trash2 } from "lucide-react";
import { AuthDialog } from "@/components/auth-dialog";
import { CoverImage } from "@/components/cover-image";
import {
  apiClient,
  getBrowserSessionRevision,
  postApi,
} from "@/lib/api-client";
import { refreshComments } from "@/lib/comment-cache";
import { authError, useAuth } from "@/providers/auth-provider";
import type { Comment } from "@/types/catalogue";

type Action =
  | { type: "add"; content: string }
  | { type: "like" | "delete"; id: number };

export function CommunityComments({
  kind,
  id,
  comments,
  heading = true,
}: {
  kind: "song" | "playlist";
  id: number;
  comments: Comment[];
  heading?: boolean;
}) {
  const { user, ready } = useAuth();
  const client = useQueryClient();
  const [content, setContent] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async (action: Action) => {
      const revision = getBrowserSessionRevision();
      if (action.type === "add") {
        await postApi(
          `/comment/add${kind === "song" ? "Song" : "Playlist"}Comment`,
          {
            [`${kind}Id`]: id,
            content: action.content,
          },
        );
      } else {
        const url = `/comment/${action.type === "like" ? "likeComment" : "deleteComment"}/${action.id}`;
        const { data } =
          action.type === "like"
            ? await apiClient.patch(url)
            : await apiClient.delete(url);
        if (data.code !== 0) throw new Error(data.message);
      }
      return { revision, action };
    },
    onSuccess: async ({ revision, action }) => {
      if (revision === getBrowserSessionRevision()) {
        if (action.type === "add") setContent("");
        setMessage(
          action.type === "add"
            ? "评论发布成功"
            : action.type === "like"
              ? "点赞成功"
              : "删除成功",
        );
      }
      await refreshComments(client, kind, id);
    },
  });
  function act(action: Action) {
    setMessage(null);
    if (!user) {
      setAuthOpen(true);
      return;
    }
    mutation.mutate(action);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const text = content.trim();
    if (text) act({ type: "add", content: text });
  }
  const sorted = [...comments].sort((a, b) => b.commentId - a.commentId);
  return (
    <div className="min-w-0">
      {heading && (
        <h2 className="mb-5 text-xl font-semibold">
          评论（{comments.length}）
        </h2>
      )}
      <form onSubmit={submit} className="mb-6">
        <label className="sr-only" htmlFor={`comment-${kind}-${id}`}>
          评论内容
        </label>
        <textarea
          id={`comment-${kind}-${id}`}
          value={content}
          maxLength={180}
          rows={4}
          placeholder="说点什么吧"
          disabled={mutation.isPending}
          onChange={(event) => setContent(event.target.value)}
          className="w-full resize-none rounded-xl border bg-background px-4 py-3 text-sm leading-6 outline-none focus:border-primary disabled:opacity-50"
        />
        <div className="mt-3 flex items-center justify-between gap-4">
          <span className="text-xs tabular-nums text-muted-foreground">
            {content.length} / 180
          </span>
          <button
            type="submit"
            disabled={!ready || !content.trim() || mutation.isPending}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2 text-sm text-white disabled:opacity-40"
          >
            {mutation.isPending && (
              <LoaderCircle size={15} className="animate-spin" />
            )}
            发布
          </button>
        </div>
      </form>
      {mutation.isError && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {authError(mutation.error, "评论操作失败，请重试")}
        </p>
      )}
      {message && (
        <p role="status" className="mb-4 text-sm text-primary">
          {message}
        </p>
      )}
      {!sorted.length ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          暂无评论，快来抢沙发吧~
        </p>
      ) : (
        <div className="divide-y">
          {sorted.map((comment) => (
            <article key={comment.commentId} className="flex gap-3 py-5">
              <div className="mt-0.5 w-9 shrink-0">
                <CoverImage src={comment.userAvatar} alt="" round />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium text-primary">
                  {comment.username ?? "用户"}
                </h3>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7">
                  {comment.content}
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                  <time>{comment.createTime}</time>
                  <div className="flex items-center gap-3">
                    {user && comment.username === user.username && (
                      <button
                        type="button"
                        aria-label={`删除评论 ${comment.commentId}`}
                        disabled={mutation.isPending}
                        onClick={() =>
                          act({ type: "delete", id: comment.commentId })
                        }
                        className="inline-flex items-center gap-1 rounded p-1 hover:text-destructive disabled:opacity-40"
                      >
                        <Trash2 size={14} />
                        删除
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`点赞评论 ${comment.commentId}`}
                      disabled={!ready || mutation.isPending}
                      onClick={() =>
                        act({ type: "like", id: comment.commentId })
                      }
                      className="inline-flex items-center gap-1 rounded p-1 hover:text-primary disabled:opacity-40"
                    >
                      <span>{comment.likeCount ?? 0}</span>
                      <ThumbsUp size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} />}
    </div>
  );
}
