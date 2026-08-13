/**
 * 通用命令工具
 * 用于执行 BFF 命令和错误处理
 */

import { lovrabetClient } from "@/api/client";

type BffExecutorClient = Pick<typeof lovrabetClient, "bff">;

/**
 * 获取命令错误信息
 */
export function getCommandErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "命令执行失败";
}

/**
 * 执行 BFF 命令，统一错误处理
 * @example executeCommand<PublishResult>("publishPrompt", { promptId: "xxx" })
 */
export async function executeCommand<T>(
  scriptName: string,
  params: Record<string, any>,
): Promise<T> {
  return executeClientCommand(lovrabetClient, scriptName, params);
}

export async function executeClientCommand<T>(
  client: BffExecutorClient,
  scriptName: string,
  params: Record<string, any>,
): Promise<T> {
  try {
    return await client.bff.execute<T>({
      scriptName,
      params,
    });
  } catch (error) {
    throw new Error(getCommandErrorMessage(error));
  }
}
