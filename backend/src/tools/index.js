/**
 * SANA AI Modular Tool & Integration Architecture
 *
 * Flow:
 * User -> SANA -> Intent/Task Router -> Tool Manager -> Permission Check
 *      -> User Confirmation (if required) -> Tool/API -> Result -> SANA Response
 */

export const TOOL_PERMISSIONS = {
  READ: 'READ',
  WRITE: 'WRITE',
  DESTRUCTIVE: 'DESTRUCTIVE',
};

export class ToolManager {
  constructor() {
    this.tools = new Map();
  }

  register(tool) {
    if (!tool.id || typeof tool.execute !== 'function') {
      throw new Error(`Invalid tool registration: ${tool?.id}`);
    }
    this.tools.set(tool.id, tool);
  }

  get(id) {
    return this.tools.get(id);
  }

  list() {
    return Array.from(this.tools.values()).map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      permissionLevel: t.permissionLevel || TOOL_PERMISSIONS.READ,
      requiresConfirmation: Boolean(t.requiresConfirmation),
    }));
  }

  /**
   * Executes a tool with permission gating and optional user confirmation checks.
   * If a tool dynamically resolves its permission requirement based on params
   * (e.g. READ action vs WRITE action), it respects tool.getPermissionLevel(params).
   */
  async execute(toolId, params = {}, context = {}) {
    const tool = this.tools.get(toolId);
    if (!tool) {
      throw new Error(`Tool not found: ${toolId}`);
    }

    // Dynamic or static permission determination
    const permission = typeof tool.getPermissionLevel === 'function'
      ? tool.getPermissionLevel(params)
      : (tool.permissionLevel || TOOL_PERMISSIONS.READ);

    const requiresConfirmation = typeof tool.getRequiresConfirmation === 'function'
      ? tool.getRequiresConfirmation(params)
      : Boolean(tool.requiresConfirmation);

    if (permission === TOOL_PERMISSIONS.WRITE || permission === TOOL_PERMISSIONS.DESTRUCTIVE) {
      if (requiresConfirmation && !context.confirmed) {
        return {
          status: 'NEEDS_CONFIRMATION',
          toolId,
          permission,
          message: `Action requires explicit user confirmation: "${tool.name}".`,
          prompt: tool.getConfirmationPrompt ? tool.getConfirmationPrompt(params) : 'Do you want to proceed?',
          pendingParams: params,
        };
      }
    }

    try {
      const result = await tool.execute(params, context);
      return {
        status: 'SUCCESS',
        toolId,
        data: result,
      };
    } catch (error) {
      return {
        status: 'ERROR',
        toolId,
        error: error.message || 'Tool execution failed',
      };
    }
  }
}

export const defaultToolManager = new ToolManager();
