import slugify from 'slugify';

export function generateSlug(name: string): string {
  return slugify(name, { lower: true, strict: true, trim: true });
}

export async function generateUniqueSlug(
  prisma: any,
  name: string,
  excludeId?: string,
): Promise<string> {
  const base = generateSlug(name);
  let slug = base;
  let counter = 1;

  while (true) {
    const existing = await prisma.product.findFirst({
      where: { slug, ...(excludeId && { NOT: { id: excludeId } }) },
    });
    if (!existing) return slug;
    slug = `${base}-${counter++}`;
  }
}
