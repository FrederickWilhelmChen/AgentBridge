import type { KnownBlock, View } from "@slack/types";
import type { SelectableWorkspace } from "../platform/types.js";
import type { AgentType } from "../domain/enums.js";

export function buildConsoleModal(args: {
  workspaces: SelectableWorkspace[];
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
        block_id: "workspace_block",
        label: {
          type: "plain_text",
          text: "Workspace"
        },
        element: {
          type: "static_select",
          action_id: "workspace",
          initial_option: {
            text: {
              type: "plain_text",
              text: args.workspaces[0]?.label ?? "Select a workspace"
            },
            value: args.workspaces[0]?.rootPath ?? ""
          },
          options: args.workspaces.map((workspace) => ({
            text: {
              type: "plain_text",
              text: workspace.label.length > 75 ? `...${workspace.label.slice(-72)}` : workspace.label
            },
            value: workspace.rootPath
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
