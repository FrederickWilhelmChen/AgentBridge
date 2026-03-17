import { actionSchema, type AgentBridgeAction } from "../domain/actions.js";

export class ActionRouter {
  public parse(input: unknown): AgentBridgeAction {
    return actionSchema.parse(input);
  }
}
