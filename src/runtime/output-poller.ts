export type OutputBuffer = {
  append(chunk: string): void;
  readTail(maxChars: number): string;
};

export function createOutputBuffer(): OutputBuffer {
  let content = "";

  return {
    append(chunk) {
      content += chunk;
      if (content.length > 20_000) {
        content = content.slice(-20_000);
      }
    },
    readTail(maxChars) {
      return content.slice(-maxChars);
    }
  };
}
