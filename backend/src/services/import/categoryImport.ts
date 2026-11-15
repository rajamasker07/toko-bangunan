import type {
  ImportCellIssue,
  ImportCommitSummary,
  ImportDuplicateMode,
  ImportPreviewRow,
  ImportRowAction,
  ParsedSpreadsheetRow,
} from '../../types/import.js';
import { normalizeWhitespace, parseTextCell } from '../../utils/spreadsheetParser.js';
import {
  CategoryRegistry,
  cleanRawSpreadsheetValues,
  deriveRowStatus,
  type Queryable,
} from './shared.js';

interface ParsedCategoryInput {
  row: ParsedSpreadsheetRow;
  name: string;
  nameLower: string;
  parentSegments: string[];
  parentPathLower: string;
  selfPathLower: string;
  description: string | null;
}

export async function runCategoryImport(
  rows: ParsedSpreadsheetRow[],
  mode: ImportDuplicateMode,
  db: Queryable,
  options: { commit: boolean }
): Promise<{
  previewRows: ImportPreviewRow[];
  commitSummary: ImportCommitSummary;
  autoCreatedCategories: string[];
  autoCreatedCategoryCount: number;
}> {
  const registry = await CategoryRegistry.load(db);
  const dbRunner: Queryable | null = options.commit ? db : null;

  const parsedInputs: ParsedCategoryInput[] = [];
  const resultsMap = new Map<number, ImportPreviewRow>();

  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let autoCreatedCategoryCount = 0;

  // 1. Validasi sintaks per baris
  for (const row of rows) {
    const messages: ImportCellIssue[] = [];
    const rawName = parseTextCell(row.values.nama_kategori);
    const rawParent = parseTextCell(row.values.kategori_induk);
    const description = parseTextCell(row.values.deskripsi);

    const name = rawName ? normalizeWhitespace(rawName) : '';
    if (!name) {
      messages.push({
        severity: 'error',
        field: 'nama_kategori',
        code: 'REQUIRED',
        message: 'Nama kategori wajib diisi.',
      });
    } else if (name.length > 100) {
      messages.push({
        severity: 'error',
        field: 'nama_kategori',
        code: 'MAX_LENGTH',
        message: 'Nama kategori maksimal 100 karakter.',
      });
    }

    let parentSegments: string[] = [];
    if (rawParent) {
      parentSegments = rawParent.split('>').map((s) => normalizeWhitespace(s));
      if (parentSegments.some((s) => !s)) {
        messages.push({
          severity: 'error',
          field: 'kategori_induk',
          code: 'INVALID_PATH',
          message:
            'Format path kategori induk tidak valid. Gunakan pemisah " > " tanpa segmen kosong.',
        });
      } else {
        for (const seg of parentSegments) {
          if (seg.length > 100) {
            messages.push({
              severity: 'error',
              field: 'kategori_induk',
              code: 'MAX_LENGTH',
              message: `Nama segmen induk "${seg.slice(0, 30)}..." melebihi 100 karakter.`,
            });
            break;
          }
        }
      }

      if (
        messages.length === 0 &&
        parentSegments.length === 1 &&
        parentSegments[0].toLowerCase() === name.toLowerCase()
      ) {
        messages.push({
          severity: 'error',
          field: 'kategori_induk',
          code: 'SELF_PARENT',
          message: 'Kategori tidak boleh menjadi induk bagi dirinya sendiri.',
        });
      }
    }

    if (messages.some((m) => m.severity === 'error')) {
      failedCount++;
      resultsMap.set(row.row_number, {
        row_number: row.row_number,
        status: 'error',
        action: 'invalid',
        identifier: name || null,
        label: name || rawName,
        raw: cleanRawSpreadsheetValues(row.values),
        messages,
      });
      continue;
    }

    const nameLower = name.toLowerCase();
    const parentPathLower = parentSegments.map((s) => s.toLowerCase()).join(' > ');
    const selfPathLower = parentPathLower ? `${parentPathLower} > ${nameLower}` : nameLower;

    parsedInputs.push({
      row,
      name,
      nameLower,
      parentSegments,
      parentPathLower,
      selfPathLower,
      description,
    });
  }

  // 2. Topological sort agar kategori induk diproses sebelum sub-kategori + deteksi circular
  const n = parsedInputs.length;
  const inDegree = new Array<number>(n).fill(0);
  const adj: number[][] = Array.from({ length: n }, () => []);

  for (let i = 0; i < n; i++) {
    const child = parsedInputs[i];
    if (child.parentSegments.length === 0) continue;

    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const potentialParent = parsedInputs[j];

      const isDirectPathMatch = child.parentPathLower === potentialParent.selfPathLower;
      const isPrefixPathMatch =
        child.parentSegments.length > 1 &&
        child.parentPathLower.startsWith(`${potentialParent.selfPathLower} > `);
      const isSingleNameMatch =
        child.parentSegments.length === 1 &&
        child.parentSegments[0].toLowerCase() === potentialParent.nameLower;

      if (isDirectPathMatch || isPrefixPathMatch || isSingleNameMatch) {
        adj[j].push(i);
        inDegree[i]++;
      }
    }
  }

  const queue: number[] = [];
  for (let i = 0; i < n; i++) {
    if (inDegree[i] === 0) queue.push(i);
  }

  // Urutkan agar kedalaman lebih dangkal diproses duluan
  queue.sort((a, b) => parsedInputs[a].parentSegments.length - parsedInputs[b].parentSegments.length);

  const orderedIndices: number[] = [];
  while (queue.length > 0) {
    const idx = queue.shift()!;
    orderedIndices.push(idx);
    for (const next of adj[idx]) {
      inDegree[next]--;
      if (inDegree[next] === 0) {
        queue.push(next);
      }
    }
  }

  // Baris yang masih memiliki inDegree > 0 berarti terlibat cycle
  for (let i = 0; i < n; i++) {
    if (inDegree[i] > 0) {
      const item = parsedInputs[i];
      failedCount++;
      resultsMap.set(item.row.row_number, {
        row_number: item.row.row_number,
        status: 'error',
        action: 'invalid',
        identifier: item.selfPathLower,
        label: item.name,
        raw: cleanRawSpreadsheetValues(item.row.values),
        messages: [
          {
            severity: 'error',
            field: 'kategori_induk',
            code: 'CIRCULAR_PARENT',
            message: 'Terjadi referensi melingkar (circular parent) pada hierarki kategori.',
          },
        ],
      });
    }
  }

  // 3. Eksekusi resolusi & simpan berurutan sesuai topological order
  const seenKeysInFile = new Map<string, number>();

  for (const idx of orderedIndices) {
    const item = parsedInputs[idx];
    const messages: ImportCellIssue[] = [];
    let action: ImportRowAction = 'invalid';
    let parentId: string | null = null;

    if (item.parentSegments.length > 0) {
      const parentRaw = item.parentSegments.join(' > ');
      const resolved = await registry.resolveCategoryPath(parentRaw, dbRunner, true);
      if (!resolved.ok) {
        messages.push({
          severity: 'error',
          field: 'kategori_induk',
          code: 'PARENT_AMBIGUOUS',
          message: resolved.error,
        });
        failedCount++;
        resultsMap.set(item.row.row_number, {
          row_number: item.row.row_number,
          status: 'error',
          action: 'invalid',
          identifier: item.selfPathLower,
          label: item.name,
          raw: cleanRawSpreadsheetValues(item.row.values),
          messages,
        });
        continue;
      }

      parentId = resolved.category.id;
      if (resolved.autoCreatedCount > 0) {
        autoCreatedCategoryCount += resolved.autoCreatedCount;
        messages.push({
          severity: 'warning',
          field: 'kategori_induk',
          code: 'AUTO_CREATE_PARENT',
          message: `Kategori induk "${registry.getFullPath(parentId)}" belum ada dan akan dibuat otomatis.`,
        });
      }
    }

    const dedupKey = `${parentId ?? 'ROOT'}::${item.nameLower}`;
    const prevRowNum = seenKeysInFile.get(dedupKey);
    if (prevRowNum !== undefined) {
      action = 'skip';
      messages.push({
        severity: 'warning',
        field: 'nama_kategori',
        code: 'DUPLICATE_IN_FILE',
        message: `Duplikat kategori pada induk yang sama dengan baris ${prevRowNum}; baris ini dilewati.`,
      });
      skippedCount++;
    } else {
      seenKeysInFile.set(dedupKey, item.row.row_number);
      const existing = registry.findByParentAndName(parentId, item.name);

      if (existing) {
        if (mode === 'skip') {
          action = 'skip';
          messages.push({
            severity: 'warning',
            field: 'nama_kategori',
            code: 'ALREADY_EXISTS',
            message: `Kategori "${registry.getFullPath(existing.id)}" sudah ada, dilewati (mode skip).`,
          });
          skippedCount++;
        } else {
          action = 'update';
          const nextDescription =
            item.description !== null ? item.description : existing.description;
          await registry.updateDescription(existing.id, item.name, nextDescription, dbRunner);
          updatedCount++;
        }
      } else {
        action = 'create';
        await registry.ensureCategoryNode(parentId, item.name, item.description, dbRunner, false);
        createdCount++;
      }
    }

    const fullPath = parentId
      ? `${registry.getFullPath(parentId)} > ${item.name}`
      : item.name;

    resultsMap.set(item.row.row_number, {
      row_number: item.row.row_number,
      status: deriveRowStatus(action, messages),
      action,
      identifier: fullPath,
      label: item.name,
      raw: cleanRawSpreadsheetValues(item.row.values),
      normalized: {
        name: item.name,
        parent_id: parentId,
        full_path: fullPath,
        description: item.description,
      },
      messages,
    });
  }

  // Kembalikan sesuai urutan baris asli file
  const previewRows = rows
    .map((r) => resultsMap.get(r.row_number)!)
    .filter(Boolean);

  return {
    previewRows,
    commitSummary: {
      total_rows: rows.length,
      processed_rows: createdCount + updatedCount + skippedCount,
      created_count: createdCount,
      updated_count: updatedCount,
      skipped_count: skippedCount,
      failed_count: failedCount,
      auto_created: {
        categories: autoCreatedCategoryCount,
        brands: 0,
        units: 0,
      },
    },
    autoCreatedCategories: registry.getAutoCreatedPaths(),
    autoCreatedCategoryCount,
  };
}
