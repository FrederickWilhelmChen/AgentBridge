import type { KnownBlock, View } from "@slack/types";
import type { SelectableWorkspace } from "../platform/types.js";
import type { AgentType } from "../domain/enums.js";

export function buildConsoleModal(args: {
  workspaces: SelectableWorkspace[];
  defaultAgent: AgentType;
}): View {
  const workspaceBlock = buildWorkspaceBlock(args.workspaces);

  return {
    type: "modal",
    callback_id: "agent_console_submit",
    title: {
      type: "plain_text",
      text: "Agent Console"
    },
    ...(workspaceBlock.canSubmit ? {
      submit: {
        type: "plain_text",
        text: "Start"
      }
    } : {}),
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
      workspaceBlock.block,
      ...(workspaceBlock.canSubmit ? [{
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
      }] : [])
    ] as KnownBlock[]
  };
}

function buildWorkspaceBlock(workspaces: SelectableWorkspace[]): { canSubmit: boolean; block: KnownBlock } {
  if (workspaces.length === 0) {
    return {
      canSubmit: false,
      block: {
        type: "section",
        block_id: "workspace_empty_block",
        text: {
          type: "mrkdwn",
          text: "No workspaces available. Configure a workspace source before starting a conversation."
        }
      }
    };
  }

  if (workspaces.length > 100) {
    return {
      canSubmit: true,
      block: {
        type: "input",
        block_id: "workspace_block",
        label: {
          type: "plain_text",
          text: "Workspace"
        },
        hint: {
          type: "plain_text",
          text: "Enter an exact workspace path or label."
        },
        element: {
          type: "plain_text_input",
          action_id: "workspace_query",
          placeholder: {
            type: "plain_text",
            text: "E:/repos/project-a or project-a"
          }
        }
      }
    };
  }

  return {
    canSubmit: true,
    block: {
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
            text: workspaces[0]?.label ?? "Select a workspace"
          },
          value: workspaces[0]?.rootPath ?? ""
        },
        options: workspaces.map((workspace) => ({
          text: {
            type: "plain_text",
            text: workspace.label.length > 75 ? `...${workspace.label.slice(-72)}` : workspace.label
          },
          value: workspace.rootPath
        }))
      }
    }
  };
}
