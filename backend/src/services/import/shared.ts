import type { Pool, PoolClient } from 'pg';
import type {
  ImportCellIssue,
  ImportCommitErrorItem,
  ImportPreviewRow,
  ImportPreviewSummary,
  ImportRowAction,
  ImportRowStatus,
} from '../../types/import.js';
import { generateUUIDv7 } from '../../utils/uuid.js';
import { normalizeWhitespace } from '../../utils/spreadsheetParser.js';

export type Queryable = Pool | PoolClient;

export interface ExistingCategoryRow {
  id: string;
  name: string;
  parent_id: string | null;
  description: string | null;
}

export function deriveRowStatus(
  action: ImportRowAction,
  messages: ImportCellIssue[]
): ImportRowStatus {
  if (action === 'invalid' || messages.some((m) => m.severity === 'error')) {
    return 'error';
  }
  if (messages.some((m) => m.severity === 'warning')) {
    return 'warning';
  }
  return 'valid';
}

export function buildPreviewSummary(
  rows: ImportPreviewRow[],
  autoCreate?: { categories: string[]; brands: string[]; units: string[] }
): ImportPreviewSummary {
  let valid_rows = 0;
  let error_rows = 0;
  let warning_rows = 0;
  let to_create = 0;
  let to_update = 0;
  let to_skip = 0;

  for (const row of rows) {
    if (row.status === 'error') {
      error_rows++;
    } else {
      valid_rows++;
      if (row.status === 'warning') {
        warning_rows++;
      }
      if (row.action === 'create') to_create++;
      else if (row.action === 'update') to_update++;
      else if (row.action === 'skip') to_skip++;
    }
  }

  return {
    total_rows: rows.length,
    valid_rows,
    error_rows,
    warning_rows,
    to_create,
    to_update,
    to_skip,
    ...(autoCreate ? { auto_create_dependencies: autoCreate } : {}),
  };
}

export function extractCommitErrorsFromPreview(rows: ImportPreviewRow[]): ImportCommitErrorItem[] {
  const errors: ImportCommitErrorItem[] = [];
  for (const row of rows) {
    for (const msg of row.messages) {
      if (msg.severity === 'error') {
        errors.push({
          row_number: row.row_number,
          identifier: row.identifier ?? null,
          field: msg.field,
          message: msg.message,
        });
      }
    }
  }
  return errors;
}

/**
 * Registry in-memory & transaksional untuk resolusi hierarki kategori berdasarkan nama/path.
 * Mendukung mode simulasi (dry-run read-only) maupun mode persist (commit di dalam PoolClient).
 */
export class CategoryRegistry {
  private byId = new Map<string, ExistingCategoryRow>();
  private byParentAndLowerName = new Map<string, ExistingCategoryRow>();
  private byLowerName = new Map<string, ExistingCategoryRow[]>();
  private virtualCounter = 0;
  private autoCreatedPaths: string[] = [];

  constructor(existingRows: ExistingCategoryRow[]) {
    for (const row of existingRows) {
      this.registerRow(row);
    }
  }

  static async load(db: Queryable): Promise<CategoryRegistry> {
    const res = await db.query(
      'SELECT id, name, parent_id, description FROM categories ORDER BY name ASC'
    );
    return new CategoryRegistry(res.rows as ExistingCategoryRow[]);
  }

  private makeParentKey(parentId: string | null, name: string): string {
    return `${parentId ?? 'ROOT'}::${normalizeWhitespace(name).toLowerCase()}`;
  }

  private registerRow(row: ExistingCategoryRow): void {
    this.byId.set(row.id, row);
    const key = this.makeParentKey(row.parent_id, row.name);
    this.byParentAndLowerName.set(key, row);

    const lower = normalizeWhitespace(row.name).toLowerCase();
    const list = this.byLowerName.get(lower) ?? [];
    if (!list.some((item) => item.id === row.id)) {
      list.push(row);
      this.byLowerName.set(lower, list);
    }
  }

  getById(id: string): ExistingCategoryRow | undefined {
    return this.byId.get(id);
  }

  findByParentAndName(parentId: string | null, name: string): ExistingCategoryRow | undefined {
    return this.byParentAndLowerName.get(this.makeParentKey(parentId, name));
  }

  findAllByLowerName(name: string): ExistingCategoryRow[] {
    return this.byLowerName.get(normalizeWhitespace(name).toLowerCase()) ?? [];
  }

  getFullPath(categoryId: string): string {
    const parts: string[] = [];
    const visited = new Set<string>();
    let currentId: string | null = categoryId;

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const node = this.byId.get(currentId);
      if (!node) break;
      parts.unshift(node.name);
      currentId = node.parent_id;
    }

    return parts.join(' > ');
  }

  getAutoCreatedPaths(): string[] {
    return [...this.autoCreatedPaths];
  }

  /**
   * Pastikan node kategori dengan (parentId, name) ada; buat jika belum ada.
   * Jika db === null -> simulasi read-only (dry-run).
   */
  async ensureCategoryNode(
    parentId: string | null,
    rawName: string,
    description: string | null,
    db: Queryable | null,
    recordAsAutoCreated = true
  ): Promise<{ category: ExistingCategoryRow; created: boolean }> {
    const name = normalizeWhitespace(rawName);
    const existing = this.findByParentAndName(parentId, name);
    if (existing) {
      return { category: existing, created: false };
    }

    let createdRow: ExistingCategoryRow;
    if (db) {
      const id = generateUUIDv7();
      const inserted = await db.query(
        `INSERT INTO categories (id, name, parent_id, description)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, parent_id, description`,
        [id, name, parentId, description]
      );
      createdRow = inserted.rows[0] as ExistingCategoryRow;
    } else {
      this.virtualCounter++;
      createdRow = {
        id: `virtual-cat-${this.virtualCounter}`,
        name,
        parent_id: parentId,
        description,
      };
    }

    this.registerRow(createdRow);
    if (recordAsAutoCreated) {
      const fullPath = this.getFullPath(createdRow.id);
      if (!this.autoCreatedPaths.includes(fullPath)) {
        this.autoCreatedPaths.push(fullPath);
      }
    }

    return { category: createdRow, created: true };
  }

  /**
   * Resolve string kategori atau path induk (e.g. "Bahan Bangunan Dasar > Semen & Mortar").
   * Untuk segmen tunggal tanpa ">", cek kecocokan root dulu, lalu kecocokan unik di tree
   * sebelum membuat kategori baru di root.
   */
  async resolveCategoryPath(
    rawPath: string,
    db: Queryable | null,
    recordAsAutoCreated = true
  ): Promise<
    | { ok: true; category: ExistingCategoryRow; autoCreatedCount: number }
    | { ok: false; error: string }
  > {
    const rawSegments = rawPath.split('>').map((s) => normalizeWhitespace(s));
    if (rawSegments.length === 0 || rawSegments.some((s) => !s)) {
      return {
        ok: false,
        error: `Format path kategori tidak valid ("${rawPath}"). Gunakan pemisah " > " tanpa segmen kosong.`,
      };
    }

    for (const seg of rawSegments) {
      if (seg.length > 100) {
        return {
          ok: false,
          error: `Nama segmen kategori "${seg.slice(0, 30)}..." melebihi batas 100 karakter.`,
        };
      }
    }

    if (rawSegments.length === 1) {
      const singleName = rawSegments[0];
      const atRoot = this.findByParentAndName(null, singleName);
      if (atRoot) {
        return { ok: true, category: atRoot, autoCreatedCount: 0 };
      }

      const anywhere = this.findAllByLowerName(singleName);
      if (anywhere.length === 1) {
        return { ok: true, category: anywhere[0], autoCreatedCount: 0 };
      }
      if (anywhere.length > 1) {
        return {
          ok: false,
          error: `Kategori "${singleName}" ditemukan di beberapa cabang berbeda. Tuliskan path lengkapnya (contoh: "Induk > ${singleName}").`,
        };
      }

      const { category, created } = await this.ensureCategoryNode(
        null,
        singleName,
        null,
        db,
        recordAsAutoCreated
      );
      return { ok: true, category, autoCreatedCount: created ? 1 : 0 };
    }

    let currentParentId: string | null = null;
    let lastCategory: ExistingCategoryRow | null = null;
    let autoCreatedCount = 0;

    for (const seg of rawSegments) {
      const { category, created } = await this.ensureCategoryNode(
        currentParentId,
        seg,
        null,
        db,
        recordAsAutoCreated
      );
      if (created) autoCreatedCount++;
      currentParentId = category.id;
      lastCategory = category;
    }

    return { ok: true, category: lastCategory!, autoCreatedCount };
  }

  async updateDescription(
    id: string,
    name: string,
    description: string | null,
    db: Queryable | null
  ): Promise<void> {
    const existing = this.byId.get(id);
    if (!existing) return;

    const nextName = normalizeWhitespace(name);
    if (db) {
      await db.query(
        `UPDATE categories
         SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [nextName, description, id]
      );
    }

    const oldKey = this.makeParentKey(existing.parent_id, existing.name);
    this.byParentAndLowerName.delete(oldKey);
    existing.name = nextName;
    existing.description = description;
    this.registerRow(existing);
  }
}
