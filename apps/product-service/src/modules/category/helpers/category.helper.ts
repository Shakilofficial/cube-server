import { BadRequestException, NotFoundException } from "@nestjs/common";

export async function guardCircularReference(
  prisma: any,
  id: string,
  parentId: string | null,
): Promise<void> {
  let current = parentId;
  while (current) {
    if (current === id) {
      throw new BadRequestException("Circular category reference detected.");
    }
    const parent = await prisma.category.findUnique({
      where: { id: current },
      select: { parentId: true },
    });
    current = parent?.parentId ?? null;
  }
}

export async function validateCategoryIds(
  prisma: any,
  ids: string[],
): Promise<void> {
  const found = await prisma.category.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  if (found.length !== ids.length) {
    const foundIds = found.map((c) => c.id);
    const missing = ids.filter((id) => !foundIds.includes(id));
    throw new NotFoundException(`Categories not found: ${missing.join(", ")}`);
  }
}
