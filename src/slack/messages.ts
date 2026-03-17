import type { KnownBlock } from "@slack/types";
import type { Run, Session } from "../domain/models.js";

function truncate(text: string, maxLength = 1500): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
}

export function buildExecutionBlocks(args: {
  title: string;
  run: Run;
  session: Session | null;
}): KnownBlock[] {
  const sessionLabel = args.session ? args.session.sessionId : "run once";
  const tail = truncate(args.run.outputTail || "(no output)");

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${args.title}*\n*Agent:* ${args.run.agentType}\n*Session:* ${sessionLabel}\n*Status:* ${args.run.status}`
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Output tail*\n\`\`\`${tail}\`\`\``
      }
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Interrupt"
          },
          action_id: "interrupt_run",
          value: args.run.runId
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Open Console"
          },
          action_id: "open_console_button",
          value: args.run.agentType
        }
      ]
    }
  ];
}

export function buildStatusBlocks(args: {
  agentType: string;
  session: Session | null;
  run: Run | null;
}): KnownBlock[] {
  if (!args.session) {
    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `No persistent session exists for *${args.agentType}*.`
        }
      }
    ];
  }

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Persistent Session Status*\n*Agent:* ${args.agentType}\n*Session:* ${args.session.sessionId}\n*State:* ${args.session.status}\n*cwd:* ${args.session.cwd}`
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Latest Output*\n\`\`\`${truncate(args.run?.outputTail ?? "(no runs yet)")}\`\`\``
      }
    }
  ];
}

export function buildInfoBlocks(text: string): KnownBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text
      }
    }
  ];
}
