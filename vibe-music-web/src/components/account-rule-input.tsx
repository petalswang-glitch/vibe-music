"use client";

import { useId, useState } from "react";
import { accountFieldValid, accountRules, type AccountFieldKind } from "@/lib/account-rules";

export function AccountRuleInput({
  kind, label, value, onChange, autoComplete,
}: {
  kind: AccountFieldKind;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [touched, setTouched] = useState(false);
  const rules = accountRules(kind, value);
  const valid = accountFieldValid(kind, value);
  const invalid = (touched || value.length > 0) && !valid;
  const showRules = focused || invalid;
  return (
    <div className="text-sm">
      <label htmlFor={id} className="flex items-center gap-1.5">
        {valid && <span aria-hidden="true">✅</span>}
        {invalid && <span aria-hidden="true">❌</span>}
        {label}
      </label>
      <span role="status" className="sr-only">
        {valid ? `${label}格式已满足` : invalid ? `${label}格式不正确，尚未完成` : ""}
      </span>
      <input
        id={id}
        required
        type={kind === "password" ? "password" : "text"}
        autoComplete={autoComplete}
        pattern={kind === "username" ? String.raw`[a-zA-Z0-9_\-]{4,16}` : undefined}
        value={value}
        onChange={(event) => { setTouched(true); onChange(event.target.value); }}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); setTouched(true); }}
        onInvalid={() => setTouched(true)}
        aria-describedby={showRules ? `${id}-rules` : undefined}
        aria-invalid={invalid}
        className={`mt-1.5 w-full rounded-lg border bg-background px-3 py-3 text-sm ${invalid ? "border-destructive" : ""}`}
      />
      {showRules && (
        <div id={`${id}-rules`} className="mt-2 rounded-lg border bg-muted/50 px-3 py-2 shadow-sm">
          <p className={`mb-1 text-xs font-medium ${invalid ? "text-destructive" : ""}`}>
            {invalid ? `${label}格式不正确，请完成以下要求` : `${label}需要满足以下条件`}
          </p>
          <ul aria-live="polite" className="space-y-1 text-xs">
            {rules.map((rule) => (
              <li key={rule.text} className={`flex items-start gap-2 ${rule.met ? "text-emerald-700 dark:text-emerald-400" : invalid ? "text-destructive" : "text-muted-foreground"}`}>
                <span aria-label={rule.met ? "已满足" : "未满足"}>{rule.met ? "✓" : invalid ? "✕" : "○"}</span>
                <span className={rule.met ? "line-through" : undefined}>{rule.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
