import { BadRequestException } from '@nestjs/common';

export async function guardCircularReference(
  prisma: any,
  id: string,
  parentId: string | null,
): Promise<void> {
  let current = parentId;
  while (current) {
    if (current === id) {
      throw new BadRequestException('Circular category reference detected.');
    }
    const parent = await prisma.category.findUnique({
      where: { id: current },
      select: { parentId: true },
    });
    current = parent?.parentId ?? null;
  }
}

export function buildCategoryTree(categories: any[]): any[] {
  const map = new Map<string, any>();
  categories.forEach((c) => map.set(c.id, { ...c, children: [] }));

  const roots: any[] = [];
  map.forEach((cat) => {
    if (cat.parentId && map.has(cat.parentId)) {
      map.get(cat.parentId).children.push(cat);
    } else {
      roots.push(cat);
    }
  });
  return roots;
}
