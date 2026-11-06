import { prisma } from "../db.js";

export async function rememberUserFact(input: {
  workspaceId: string;
  userId: string;
  content: string;
}): Promise<void> {
  const content = input.content.trim();
  if (!content || content.length > 1000) throw new Error("Memory must be 1-1000 characters.");

  await prisma.user.upsert({
    where: { id_workspaceId: { id: input.userId, workspaceId: input.workspaceId } },
    create: { id: input.userId, workspaceId: input.workspaceId },
    update: {}
  });

  await prisma.memory.create({
    data: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      content,
      source: "user_explicit"
    }
  });
}

export async function forgetUserMemories(workspaceId: string, userId: string): Promise<number> {
  const result = await prisma.memory.deleteMany({ where: { workspaceId, userId } });
  return result.count;
}
