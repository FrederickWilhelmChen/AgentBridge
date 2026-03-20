import type { KnownBlock } from "@slack/types";
import type { Run, Session } from "../domain/models.js";

const SLACK_SECTION_TEXT_LIMIT = 3000;

export function buildExecutionBlocks(args: {
  title: string;
  run: Run;
  session: Session | null;
}): KnownBlock[] {
  const sessionLabel = args.session ? args.session.sessionId : "run once";
  const tail = formatCodeBlockSection("*Output tail*", args.run.outputTail || "(no output)");

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${args.title}*\n*Agent:* ${args.run.agentType}\n*Session:* ${sessionLabel}\n*Status:* ${args.run.status}${args.session ? `\n*cwd:* ${args.session.cwd}` : ""}`
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: tail
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
        text: formatCodeBlockSection("*Latest Output*", args.run?.outputTail ?? "(no runs yet)")
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

function formatCodeBlockSection(title: string, body: string): string {
  const normalized = body.replace(/\r/g, "");
  const suffix = "\n_...truncated for Slack display._";
  const wrapperOverhead = title.length + "\n```".length + "```".length;
  const maxBodyLength = SLACK_SECTION_TEXT_LIMIT - wrapperOverhead;

  if (title.length + 6 + normalized.length <= SLACK_SECTION_TEXT_LIMIT) {
    return `${title}\n\`\`\`${normalized}\`\`\``;
  }

  const truncatedBodyLength = Math.max(0, maxBodyLength - suffix.length);
  const truncatedBody = normalized.slice(0, truncatedBodyLength);
  return `${title}\n\`\`\`${truncatedBody}\`\`\`${suffix}`;
}
