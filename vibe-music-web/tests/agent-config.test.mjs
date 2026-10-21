import assert from "node:assert/strict";
import test from "node:test";
import { apiClient, setBrowserToken } from "../src/lib/api-client.ts";
import { saveAgentConfiguration, removeAgentConfiguration } from "../src/lib/agent-config.ts";

test("personal key upload and removal capture their owner before a later login", async () => {
  const previousWindow = globalThis.window;
  const previousAdapter = apiClient.defaults.adapter;
  globalThis.window = new EventTarget();
  const seen = [];
  apiClient.defaults.adapter = async (config) => {
    seen.push({ token: config.headers.Authorization, body: config.data, method: config.method });
    return { status: 200, statusText: "OK", data: {code:0, data:{configured:true,provider:"siliconflow",modelName:"test"}}, headers:{}, config };
  };
  try {
    setBrowserToken("user-a");
    const save = saveAgentConfiguration({provider:"siliconflow",modelName:"test",apiKey:"fake-personal-key"}, new AbortController().signal);
    setBrowserToken("user-b");
    await save;
    assert.equal(seen[0].token, "Bearer user-a");
    assert.equal(JSON.parse(seen[0].body).apiKey, "fake-personal-key");
    const remove = removeAgentConfiguration(new AbortController().signal);
    setBrowserToken("user-c");
    await remove;
    assert.equal(seen[1].token,"Bearer user-b");
    assert.equal(seen[1].method,"delete");
    setBrowserToken(null);
    await assert.rejects(saveAgentConfiguration({provider:"openai",modelName:"test"},new AbortController().signal),/请先登录/);
    assert.equal(seen.length,2);
  } finally {
    setBrowserToken(null); apiClient.defaults.adapter=previousAdapter; globalThis.window=previousWindow;
  }
});
