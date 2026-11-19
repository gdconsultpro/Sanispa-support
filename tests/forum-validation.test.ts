import { test } from "node:test";
import assert from "node:assert/strict";
import { forumPostSchema } from "../lib/forum-validation";
import { readJson } from "../lib/http";

const post = { title: "Test", body: "Test du forum pour voir si ça fonctionne en public", parentId: null };
test("the forum accepts the reported four-character title and trims surrounding spaces", () => {
  assert.deepEqual(forumPostSchema.parse(post), post);
  assert.deepEqual(forumPostSchema.parse({ ...post, title: " Test ", body: ` ${post.body} ` }), post);
});
test("forum validation identifies invalid fields without requiring a title for replies", () => {
  for (const title of ["", "  ", "ab", "x".repeat(151)]) {
    const result = forumPostSchema.safeParse({ ...post, title });
    assert.equal(result.success, false);
    if (!result.success) assert.deepEqual(result.error.issues[0].path, ["title"]);
  }
  const result = forumPostSchema.safeParse({ ...post, body: "     court    " });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.issues[0].message, "Votre message doit contenir au moins 10 caractères.");
  assert.equal(forumPostSchema.safeParse({ ...post, title: "", parentId: "30000000-0000-4000-8000-000000000001" }).success, true);
  assert.equal(forumPostSchema.safeParse({ ...post, parentId: "invalid" }).success, false);
});
test("the forum accepts a full-length Unicode message within its request size limit", async () => {
  const payload = { ...post, body: "é".repeat(3000) };
  const request = new Request("https://example.invalid/api/client/forum", { method: "POST", body: JSON.stringify(payload) });
  assert.deepEqual(forumPostSchema.parse(await readJson(request, 20000)), payload);
  assert.equal(forumPostSchema.safeParse({ ...payload, body: payload.body + "a" }).success, false);
});
