"use client";

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AdminDialog } from "@/components/admin-dialog";
import { adminClient, adminPost, adminRevision } from "@/lib/admin-api";
import {
  userPayload,
  type ManagedUser,
  type UserFormValues,
} from "@/lib/admin-users";
import { authError } from "@/providers/auth-provider";

export function AdminUserForm({
  user,
  onClose,
  onSaved,
}: {
  user: ManagedUser | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<UserFormValues>(() => ({
    username: user?.username ?? "",
    password: "",
    email: user?.email ?? "",
    phone: user?.phone ?? "",
    introduction: user?.introduction ?? "",
    enabled: true,
  }));
  const mutation = useMutation({
    mutationFn: async () => {
      const revision = adminRevision();
      const body = userPayload(values, user?.userId);
      if (user) {
        const { data } = await adminClient.put("/admin/updateUser", body);
        if (data.code !== 0) throw new Error(data.message);
      } else await adminPost("/admin/addUser", body);
      return revision;
    },
    onSuccess: async (revision) => {
      if (revision === adminRevision()) await onSaved();
    },
  });
  const field =
    "mt-2 w-full rounded-md border bg-background px-3 py-2 outline-none focus:border-primary disabled:opacity-50";
  function change<K extends keyof UserFormValues>(
    key: K,
    value: UserFormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
    mutation.reset();
  }
  return (
    <AdminDialog
      title={user ? "修改用户" : "新增用户"}
      wide
      busy={mutation.isPending}
      error={
        mutation.isError ? authError(mutation.error, "保存失败，请重试") : null
      }
      onClose={onClose}
      onConfirm={() => {
        if (form.current?.reportValidity()) mutation.mutate();
      }}
    >
      <form
        ref={form}
        onSubmit={(event) => {
          event.preventDefault();
          if (!mutation.isPending) mutation.mutate();
        }}
        className="grid gap-5 sm:grid-cols-2"
      >
        {user && (
          <label className="text-sm">
            用户编号
            <input value={user.userId} disabled className={field} />
          </label>
        )}
        <label className="text-sm">
          用户名
          <input
            required
            pattern="[a-zA-Z0-9_-]{4,16}"
            title="4-16位字母、数字、下划线或连字符"
            autoComplete="off"
            value={values.username}
            disabled={mutation.isPending}
            onChange={(event) => change("username", event.target.value)}
            className={field}
          />
        </label>
        {!user && (
          <label className="text-sm">
            用户密码
            <input
              type="password"
              required
              minLength={8}
              maxLength={18}
              pattern="(?![0-9]+$)(?![a-zA-Z]+$)[0-9A-Za-z\W]{8,18}"
              title="8-18位数字、字母、符号的组合"
              autoComplete="new-password"
              value={values.password}
              disabled={mutation.isPending}
              onChange={(event) => change("password", event.target.value)}
              className={field}
            />
          </label>
        )}
        <label className="text-sm">
          邮箱
          <input
            type="email"
            required
            maxLength={128}
            value={values.email}
            disabled={mutation.isPending}
            onChange={(event) => change("email", event.target.value)}
            className={field}
          />
        </label>
        <label className="text-sm">
          手机号
          <input
            inputMode="tel"
            pattern="1[3-9][0-9]{9}"
            maxLength={11}
            value={values.phone}
            disabled={mutation.isPending}
            onChange={(event) => change("phone", event.target.value)}
            className={field}
          />
        </label>
        <label className="text-sm sm:col-span-2">
          简介
          <textarea
            maxLength={100}
            rows={3}
            value={values.introduction}
            disabled={mutation.isPending}
            onChange={(event) => change("introduction", event.target.value)}
            className={`${field} resize-none`}
          />
        </label>
        {!user && (
          <label className="flex items-center gap-3 text-sm">
            用户状态
            <input
              type="checkbox"
              role="switch"
              aria-label="新增用户启用"
              checked={values.enabled}
              disabled={mutation.isPending}
              onChange={(event) => change("enabled", event.target.checked)}
            />
            {values.enabled ? "启用" : "禁用"}
          </label>
        )}
        <button type="submit" className="sr-only" tabIndex={-1}>
          保存用户
        </button>
      </form>
    </AdminDialog>
  );
}
