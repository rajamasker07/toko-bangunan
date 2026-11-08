import { query } from '../config/db.js';
import { generateUUIDv7 } from '../utils/uuid.js';

export interface CategoryItem {
  id: string;
  name: string;
  parent_id: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  parent_name?: string | null;
  children?: CategoryItem[];
}

export class CategoryService {
  static async getAllCategories(asTree = false) {
    const sql = `
      SELECT c.*, p.name as parent_name
      FROM categories c
      LEFT JOIN categories p ON c.parent_id = p.id
      ORDER BY c.name ASC
    `;
    const res = await query(sql);
    const rows = res.rows as CategoryItem[];

    if (!asTree) {
      return rows;
    }

    // Build hierarchical tree
    const map = new Map<string, CategoryItem>();
    const roots: CategoryItem[] = [];

    rows.forEach(item => {
      map.set(item.id, { ...item, children: [] });
    });

    rows.forEach(item => {
      const node = map.get(item.id)!;
      if (item.parent_id && map.has(item.parent_id)) {
        map.get(item.parent_id)!.children!.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }

  static async getCategoryById(id: string) {
    const res = await query('SELECT * FROM categories WHERE id = $1', [id]);
    return res.rows[0] || null;
  }

  static async createCategory(data: { name: string; parent_id?: string | null; description?: string }) {
    const id = generateUUIDv7();
    const res = await query(
      `INSERT INTO categories (id, name, parent_id, description)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, data.name, data.parent_id || null, data.description || null]
    );
    return res.rows[0];
  }

  static async updateCategory(id: string, data: { name: string; parent_id?: string | null; description?: string }) {
    const res = await query(
      `UPDATE categories
       SET name = $1, parent_id = $2, description = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [data.name, data.parent_id || null, data.description || null, id]
    );
    return res.rows[0];
  }

  static async deleteCategory(id: string) {
    // Check if has children
    const childCheck = await query('SELECT COUNT(*) FROM categories WHERE parent_id = $1', [id]);
    if (parseInt(childCheck.rows[0].count) > 0) {
      throw new Error('Kategori memiliki sub-kategori. Harap hapus atau pindahkan sub-kategori terlebih dahulu.');
    }

    const res = await query('DELETE FROM categories WHERE id = $1 RETURNING *', [id]);
    return res.rows[0];
  }
}
