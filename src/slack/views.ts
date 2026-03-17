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
      text: "Run"
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
        block_id: "action_block",
        label: {
          type: "plain_text",
          text: "Action"
        },
        element: {
          type: "static_select",
          action_id: "action",
          initial_option: {
            text: { type: "plain_text", text: "Run Once" },
            value: "run_once"
          },
          options: [
            {
              text: { type: "plain_text", text: "Run Once" },
              value: "run_once"
            },
            {
              text: { type: "plain_text", text: "Send to Persistent Session" },
              value: "send_persistent"
            },
            {
              text: { type: "plain_text", text: "New Persistent Session" },
              value: "new_session"
            },
            {
              text: { type: "plain_text", text: "Status" },
              value: "status"
            },
            {
              text: { type: "plain_text", text: "Restart Session" },
              value: "restart_session"
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
        optional: true,
        label: {
          type: "plain_text",
          text: "Message"
        },
        element: {
          type: "plain_text_input",
          action_id: "message",
          multiline: true,
          placeholder: {
            type: "plain_text",
            text: "Required for Run Once and Send to Persistent Session"
          }
        }
      }
    ] as KnownBlock[]
  };
}
