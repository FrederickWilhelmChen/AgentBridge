import type { KnownBlock, View } from "@slack/types";
import type { AgentType } from "../domain/enums.js";

export function buildConsoleModal(args: {
  allowedCwds: string[];
  defaultAgent: AgentType;
}): View {
  return {
    type: "modal",
    callback_id: "agent_console_submit",
    title: {
      type: "plain_text",
      text: "Agent Console"
    },
    submit: {
      type: "plain_text",
      text: "Start"
    },
    close: {
      type: "plain_text",
      text: "Cancel"
    },
    blocks: [
      {
        type: "input",
        block_id: "agent_block",
        label: {
          type: "plain_text",
          text: "Agent"
        },
        element: {
          type: "static_select",
          action_id: "agent",
          initial_option: {
            text: {
              type: "plain_text",
              text: args.defaultAgent === "claude" ? "Claude" : "Codex"
            },
            value: args.defaultAgent
          },
          options: [
            {
              text: { type: "plain_text", text: "Claude" },
              value: "claude"
            },
            {
              text: { type: "plain_text", text: "Codex" },
              value: "codex"
            }
          ]
        }
      },
      {
        type: "input",
        block_id: "cwd_block",
        label: {
          type: "plain_text",
          text: "Working Directory"
        },
        element: {
          type: "static_select",
          action_id: "cwd",
          initial_option: {
            text: {
              type: "plain_text",
              text: args.allowedCwds[0] ?? "Select a directory"
            },
            value: args.allowedCwds[0] ?? ""
          },
          options: args.allowedCwds.map((cwd) => ({
            text: {
              type: "plain_text",
              text: cwd.length > 75 ? `...${cwd.slice(-72)}` : cwd
            },
            value: cwd
          }))
        }
      },
      {
        type: "input",
        block_id: "message_block",
        label: {
          type: "plain_text",
          text: "Opening Message"
        },
        element: {
          type: "plain_text_input",
          action_id: "message",
          multiline: true,
          placeholder: {
            type: "plain_text",
            text: "Required. This starts the conversation."
          }
        }
      }
    ] as KnownBlock[]
  };
}
