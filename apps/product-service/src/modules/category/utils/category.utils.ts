import slugify from "slugify";

export function generateSlug(name: string): string {
  return slugify(name, { lower: true, strict: true, trim: true });
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
