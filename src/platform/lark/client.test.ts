import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { readLarkResourceBytes } from "./client.js";

test("readLarkResourceBytes reads bytes from the SDK resource stream wrapper", async () => {
  const bytes = await readLarkResourceBytes({
    getReadableStream() {
      return Readable.from([Buffer.from([1, 2]), Buffer.from([3, 4])]);
    }
  });

  assert.deepEqual([...bytes], [1, 2, 3, 4]);
});
