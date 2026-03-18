export type LarkMessageContent = {
  msg_type: "text";
  content: string;
};

export function buildLarkTextMessage(text: string): LarkMessageContent {
  return {
    msg_type: "text",
    content: JSON.stringify({ text })
  };
}
