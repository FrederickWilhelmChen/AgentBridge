import { z } from "zod";

const agentTypeSchema = z.enum(["claude", "codex"]);

export const createSessionActionSchema = z.object({
  type: z.literal("create_session"),
  agentType: agentTypeSchema,
  cwd: z.string().min(1)
});

export const sendMessageActionSchema = z.object({
  type: z.literal("send_message"),
  sessionId: z.string().min(1),
  message: z.string().min(1)
});

export const runOnceActionSchema = z.object({
  type: z.literal("run_once"),
  agentType: agentTypeSchema,
  cwd: z.string().min(1),
  message: z.string().min(1)
});

export const getStatusActionSchema = z.object({
  type: z.literal("get_status"),
  sessionId: z.string().min(1)
});

export const interruptRunActionSchema = z.object({
  type: z.literal("interrupt_run"),
  runId: z.string().min(1)
});

export const restartSessionActionSchema = z.object({
  type: z.literal("restart_session"),
  sessionId: z.string().min(1)
});

export const setCwdActionSchema = z.object({
  type: z.literal("set_cwd"),
  sessionId: z.string().min(1),
  cwd: z.string().min(1)
});

export const actionSchema = z.discriminatedUnion("type", [
  createSessionActionSchema,
  sendMessageActionSchema,
  runOnceActionSchema,
  getStatusActionSchema,
  interruptRunActionSchema,
  restartSessionActionSchema,
  setCwdActionSchema
]);

export type AgentBridgeAction = z.infer<typeof actionSchema>;
