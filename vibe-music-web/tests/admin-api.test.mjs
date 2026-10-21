import assert from "node:assert/strict";
import test from "node:test";
import { AxiosError } from "axios";
import {
  adminClient,
  adminGet,
  adminRevision,
  adminStorageKey,
  setAdminToken,
} from "../src/lib/admin-api.ts";
import {
  apiClient,
  authStorageKey,
  getApi,
  getBrowserToken,
  setBrowserToken,
} from "../src/lib/api-client.ts";

test("private profile verification uses its explicit token without publishing it to other requests", async () => {
  const previousWindow = globalThis.window;
  const previousAdapter = apiClient.defaults.adapter;
  globalThis.window = new EventTarget();
  const seen = [];
  apiClient.defaults.adapter = async (config) => {
    seen.push(config.headers.Authorization);
    return {
      status: 200,
      statusText: "OK",
      data: { code: 0, data: {} },
      headers: {},
      config,
    };
  };
  try {
    setBrowserToken("verified-old-session");
    await apiClient.get("/user/getUserInfo", {
      headers: { Authorization: "Bearer unverified-new-session" },
    });
    await getApi("/song/getSongDetail/1");
    assert.deepEqual(seen, [
      "Bearer unverified-new-session",
      "Bearer verified-old-session",
    ]);
    assert.equal(getBrowserToken(), "verified-old-session");
    setBrowserToken(null);
    await apiClient.get("/user/getUserInfo", {
      headers: { Authorization: "Bearer unverified-new-session" },
    });
    await getApi("/song/getSongDetail/1");
    assert.equal(getBrowserToken(), null);
    assert.equal(seen.at(-1), undefined);
  } finally {
    setBrowserToken(null);
    apiClient.defaults.adapter = previousAdapter;
    globalThis.window = previousWindow;
  }
});

test("admin and user requests keep independent credentials, expiration events, and storage", async () => {
  const previousWindow = globalThis.window;
  globalThis.window = new EventTarget();
  const previousAdmin = adminClient.defaults.adapter;
  const previousUser = apiClient.defaults.adapter;
  let adminExpired = 0;
  let userExpired = 0;
  window.addEventListener("vibe-admin-expired", () => adminExpired++);
  window.addEventListener("vibe-auth-expired", () => userExpired++);
  const seen = [];
  const adapter = async (config) => {
    seen.push(config.headers.Authorization);
    return {
      status: 200,
      statusText: "OK",
      data: { code: 0, data: null },
      headers: {},
      config,
    };
  };
  try {
    adminClient.defaults.adapter = adapter;
    apiClient.defaults.adapter = adapter;
    setBrowserToken("user-session");
    setAdminToken("admin-session");
    assert.notEqual(adminStorageKey, authStorageKey);
    await getApi("/user/getUserInfo");
    await adminGet("/admin/session");
    assert.deepEqual(seen, ["Bearer user-session", "Bearer admin-session"]);
    const before = adminRevision();
    setAdminToken(null);
    assert.equal(adminRevision(), before + 1);
    await getApi("/user/getUserInfo");
    await adminGet("/admin/session");
    assert.deepEqual(seen.slice(-2), ["Bearer user-session", undefined]);
    setAdminToken("new-admin-session");
    adminClient.defaults.adapter = async (config) => {
      const response = { status: 401, data: {}, headers: {}, config };
      throw new AxiosError(
        "Expired",
        "ERR_BAD_REQUEST",
        config,
        null,
        response,
      );
    };
    await assert.rejects(adminGet("/admin/session"));
    assert.equal(adminExpired, 1);
    assert.equal(userExpired, 0);
    await getApi("/user/getUserInfo");
    assert.equal(seen.at(-1), "Bearer user-session");
  } finally {
    setAdminToken(null);
    setBrowserToken(null);
    adminClient.defaults.adapter = previousAdmin;
    apiClient.defaults.adapter = previousUser;
    globalThis.window = previousWindow;
  }
});

test("a late 401 from an old admin session cannot expire the new administrator", async () => {
  const previousWindow = globalThis.window;
  globalThis.window = new EventTarget();
  const adapter = adminClient.defaults.adapter;
  let expire = 0;
  window.addEventListener("vibe-admin-expired", () => expire++);
  let rejectOld;
  let started;
  const dispatched = new Promise((resolve) => {
    started = resolve;
  });
  try {
    setAdminToken("old-session");
    adminClient.defaults.adapter = (config) =>
      new Promise((resolve, reject) => {
        rejectOld = () =>
          reject(
            new AxiosError("Expired", "ERR_BAD_REQUEST", config, null, {
              status: 401,
              data: {},
              headers: {},
              config,
            }),
          );
        started();
      });
    const old = adminGet("/admin/getAllFeedbacks");
    await dispatched;
    setAdminToken("new-session");
    rejectOld();
    await assert.rejects(old);
    assert.equal(expire, 0);
  } finally {
    setAdminToken(null);
    adminClient.defaults.adapter = adapter;
    globalThis.window = previousWindow;
  }
});
