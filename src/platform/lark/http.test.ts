import test from "node:test";
import assert from "node:assert/strict";
import { parseAxiosProxyConfig } from "./http.js";

test("parseAxiosProxyConfig returns null when no proxy is configured", () => {
  assert.equal(parseAxiosProxyConfig(null), null);
});

test("parseAxiosProxyConfig parses an http proxy url", () => {
  assert.deepEqual(parseAxiosProxyConfig("http://127.0.0.1:10088"), {
    protocol: "http",
    host: "127.0.0.1",
    port: 10088
  });
});
