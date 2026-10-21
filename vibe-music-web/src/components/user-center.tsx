"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AuthDialog } from "@/components/auth-dialog";
import { AvatarCropper } from "@/components/avatar-cropper";
import { AgentSettings } from "@/components/agent-settings";
import { apiClient } from "@/lib/api-client";
import { mediaUrl } from "@/lib/media-url";
import { authError, useAuth, type UserInfo } from "@/providers/auth-provider";

export function UserCenter() {
  const { user, ready } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  if (!ready) return <p role="status">正在验证登录状态...</p>;
  if (!user)
    return (
      <section>
        <h1 className="font-serif-display text-2xl">个人中心</h1>
        <p className="my-5 text-muted-foreground">请登录后编辑个人资料</p>
        <button
          onClick={() => setDismissed(false)}
          className="rounded-lg bg-primary px-5 py-2 text-white"
        >
          登录 / 注册
        </button>
        {!dismissed && <AuthDialog onClose={() => setDismissed(true)} />}
      </section>
    );
  return <ProfileForm key={user.userId} user={user} />;
}

function ProfileForm({ user }: { user: UserInfo }) {
  const { refreshUser, clearSession } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    username: user.username,
    email: user.email,
    phone: user.phone ?? "",
    introduction: user.introduction ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [avatarFailed, setAvatarFailed] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { data } = await apiClient.put("/user/updateUserInfo", {
        ...form,
        userId: user.userId,
      });
      if (data.code !== 0) throw new Error(data.message);
      await refreshUser();
      setMessage("更新成功");
    } catch (cause) {
      setError(authError(cause, "更新失败"));
    } finally {
      setBusy(false);
    }
  }
  async function upload(blob: Blob) {
    const data = new FormData();
    data.append("avatar", blob, "avatar.png");
    const response = await apiClient.patch("/user/updateUserAvatar", data);
    if (response.data.code !== 0) throw new Error(response.data.message);
    await refreshUser();
    setMessage("头像更新成功");
    setError(null);
  }
  async function removeAccount() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { data } = await apiClient.delete("/user/deleteAccount");
      if (data.code !== 0) throw new Error(data.message);
      clearSession();
      router.push("/");
    } catch (cause) {
      setError(authError(cause, "注销失败"));
      setBusy(false);
      setConfirmDelete(false);
    }
  }
  const avatar = mediaUrl(user.userAvatar) ?? "/images/default-user.jpg";
  return (
    <section className="mx-auto max-w-5xl rounded-xl border bg-card p-6 text-card-foreground shadow-paper md:p-10">
      <h1 className="mb-6 text-xl">个人中心</h1>
      <p className="mb-2 text-sm text-muted-foreground">头像</p>
      <button
        disabled={busy}
        onClick={() => picker.current?.click()}
        className="group relative mb-6 flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-muted"
        aria-label="更新头像"
      >
        <Image
          src={avatarFailed === avatar ? "/images/default-user.jpg" : avatar}
          alt="用户头像"
          width={96}
          height={96}
          unoptimized
          className="h-full w-full object-cover"
          onError={() => setAvatarFailed(avatar)}
        />
        <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm text-white opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">
          更新头像
        </span>
      </button>
      <input
        ref={picker}
        type="file"
        accept="image/*"
        aria-label="选择头像图片"
        className="sr-only"
        onChange={(event) => {
          const selected = event.target.files?.[0];
          event.target.value = "";
          if (!selected) return;
          if (selected.size > 100 * 1024 * 1024) {
            setError("头像文件不能超过100MB");
            return;
          }
          setFile(selected);
        }}
      />
      <form onSubmit={(event) => void submit(event)} className="space-y-6">
        <label className="block text-sm">
          用户名
          <input
            required
            autoComplete="username"
            pattern="[a-zA-Z0-9_-]{4,16}"
            maxLength={16}
            title="4-16位字母、数字、下划线、连字符"
            value={form.username}
            disabled={busy}
            onChange={(event) =>
              setForm({ ...form, username: event.target.value })
            }
            className="mt-2 block w-full rounded-lg border bg-background px-4 py-3"
          />
        </label>
        <label className="block text-sm">
          邮箱
          <input
            required
            autoComplete="email"
            type="email"
            value={form.email}
            disabled={busy}
            onChange={(event) =>
              setForm({ ...form, email: event.target.value })
            }
            className="mt-2 block w-full rounded-lg border bg-background px-4 py-3"
          />
        </label>
        <label className="block text-sm">
          联系电话
          <input
            autoComplete="tel"
            type="tel"
            pattern="1[3-9][0-9]{9}"
            title="请输入正确的手机号码"
            value={form.phone}
            disabled={busy}
            onChange={(event) =>
              setForm({ ...form, phone: event.target.value })
            }
            className="mt-2 block w-full rounded-lg border bg-background px-4 py-3"
          />
        </label>
        <label className="block text-sm">
          简介
          <textarea
            rows={4}
            maxLength={100}
            value={form.introduction}
            disabled={busy}
            onChange={(event) =>
              setForm({ ...form, introduction: event.target.value })
            }
            className="mt-2 block w-full resize-none rounded-lg border bg-background px-4 py-3"
          />
          <span className="mt-1 block text-right text-xs text-muted-foreground">
            {form.introduction.length} / 100
          </span>
        </label>
        {message && (
          <p role="status" className="text-sm text-primary">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-primary">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-between gap-3 pt-4">
          <button
            disabled={busy}
            className="rounded-lg bg-primary px-6 py-3 text-white disabled:opacity-40"
          >
            {busy ? "处理中..." : "更新信息"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
            className="rounded-lg border border-primary px-6 py-3 text-primary disabled:opacity-40"
          >
            注销账号
          </button>
        </div>
      </form>
      <AgentSettings userId={user.userId} />
      {file && (
        <AvatarCropper
          file={file}
          upload={upload}
          close={() => setFile(null)}
        />
      )}
      {confirmDelete && (
        <DeleteDialog
          busy={busy}
          cancel={() => setConfirmDelete(false)}
          confirm={() => void removeAccount()}
        />
      )}
    </section>
  );
}

function DeleteDialog({
  busy,
  cancel,
  confirm,
}: {
  busy: boolean;
  cancel: () => void;
  confirm: () => void;
}) {
  // Native modal keeps focus inside the destructive confirmation.
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) cancel();
      }}
      aria-labelledby="delete-title"
      className="w-[min(28rem,calc(100%-2rem))] rounded-2xl border bg-card p-6 text-card-foreground backdrop:bg-black/40"
    >
      <h2 id="delete-title" className="text-lg">
        警告
      </h2>
      <p className="my-5 text-sm leading-6">
        注销账号后，所有数据将被清除且无法恢复，是否确认注销？
      </p>
      <div className="flex justify-end gap-3">
        <button
          disabled={busy}
          onClick={cancel}
          className="rounded-lg border px-4 py-2"
        >
          取消
        </button>
        <button
          disabled={busy}
          onClick={confirm}
          className="rounded-lg bg-primary px-4 py-2 text-white"
        >
          {busy ? "处理中..." : "确认"}
        </button>
      </div>
    </dialog>
  );
}
