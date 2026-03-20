export type LarkMessageContent = {
  msg_type: "text" | "interactive";
  content: string;
};

export function buildLarkTextMessage(text: string): LarkMessageContent {
  return {
    msg_type: "text",
    content: JSON.stringify({ text })
  };
}

export function buildLarkProgressCard(title: string, status: string, body: string): LarkMessageContent {
  return {
    msg_type: "interactive",
    content: JSON.stringify({
      config: {
        update_multi: true,
        wide_screen_mode: true
      },
      header: {
        template: resolveCardTemplate(status),
        title: {
          tag: "plain_text",
          content: title
        }
      },
      elements: [
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**Status:** ${escapeLarkMd(status)}`
          }
        },
        {
          tag: "markdown",
          content: body || "(no output)"
        }
      ]
    })
  };
}

function resolveCardTemplate(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (normalized.includes("fail") || normalized.includes("error")) {
    return "red";
  }

  if (normalized.includes("process") || normalized.includes("running")) {
    return "orange";
  }

  return "green";
}

function escapeLarkMd(text: string): string {
  return text.replace(/([*_`~])/g, "\\$1");
}
