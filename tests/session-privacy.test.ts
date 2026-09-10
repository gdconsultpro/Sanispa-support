import test from "node:test";
import assert from "node:assert/strict";
import { reconcileLocalOwner } from "../lib/session-privacy";

test("a shared browser never restores another client's draft, including logout in another tab", () => {
  const values = new Map<string,string>();
  const storage = { getItem: (key:string) => values.get(key) ?? null, setItem: (key:string,value:string) => { values.set(key,value); }, removeItem: (key:string) => { values.delete(key); } };
  values.set("sanispa-diagnostic-draft", "legacy draft with unknown owner");
  reconcileLocalOwner(storage, null);
  assert.equal(storage.getItem("sanispa-diagnostic-draft"), null);
  values.set("sanispa-diagnostic-draft", "anonymous draft to finish signing up");
  assert.equal(reconcileLocalOwner(storage, "client-a"), false);
  assert(storage.getItem("sanispa-diagnostic-draft"));
  values.set("sanispa-water-session-token", "private-a");
  assert.equal(reconcileLocalOwner(storage, "client-b"), true);
  assert.equal(storage.getItem("sanispa-diagnostic-draft"), null);
  assert.equal(storage.getItem("sanispa-water-session-token"), null);
  values.set("sanispa-diagnostic-draft", "private-b");
  // Another tab has already cleared the shared owner marker. The current tab still remembers B.
  storage.removeItem("sanispa-local-owner");
  assert.equal(reconcileLocalOwner(storage, null, "client-b"), true);
  assert.equal(storage.getItem("sanispa-diagnostic-draft"), null);
});
