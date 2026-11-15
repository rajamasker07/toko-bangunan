import type {
  ImportCellIssue,
  ImportCommitSummary,
  ImportDuplicateMode,
  ImportPreviewRow,
  ImportRowAction,
  ParsedSpreadsheetRow,
} from '../../types/import.js';
import {
  normalizeWhitespace,
  parseBooleanFlag,
  parseSalesPhones,
  parseTextCell,
  type ParsedSalesPhone,
} from '../../utils/spreadsheetParser.js';
import { generateUUIDv7 } from '../../utils/uuid.js';
import { isValidOptionalEmail } from '../../validators/importValidator.js';
import { deriveRowStatus, type Queryable } from './shared.js';

interface ExistingSupplier {
  id: string;
  name: string;
  code: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  is_active: boolean;
}

interface ExistingSupplierSales {
  id: string;
  supplier_id: string;
  name: string;
  email: string | null;
  is_active: boolean;
  phones: ParsedSalesPhone[];
  notes: string | null;
}

interface ParsedSupplierFields {
  code: string | null;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  address: string | null;
  notes: string | null;
  isActiveExplicit: boolean | null;
}

function generateSupplierCode(name: string, usedLowerCodes: Set<string>): string {
  const clean = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4) || 'MAT';
  for (let i = 0; i < 30; i++) {
    const rand = Math.floor(1000 + Math.random() * 9000);
    const candidate = `SUP-${clean}-${rand}`;
    if (!usedLowerCodes.has(candidate.toLowerCase())) {
      usedLowerCodes.add(candidate.toLowerCase());
      return candidate;
    }
  }
  const fallback = `SUP-${clean}-${Date.now().toString().slice(-6)}`;
  usedLowerCodes.add(fallback.toLowerCase());
  return fallback;
}

async function insertSupplierSalesRecord(
  db: Queryable,
  salesByKey: Map<string, ExistingSupplierSales>,
  supplierId: string,
  input: {
    name: string;
    email: string | null;
    isActive: boolean;
    phones: ParsedSalesPhone[];
    notes: string | null;
  }
): Promise<void> {
  const salesId = generateUUIDv7();
  const inserted = await db.query(
    `INSERT INTO supplier_sales (id, supplier_id, name, email, is_active, phones, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      salesId,
      supplierId,
      input.name,
      input.email,
      input.isActive,
      JSON.stringify(input.phones),
      input.notes,
    ]
  );
  salesByKey.set(
    `${supplierId}::${input.name.toLowerCase()}`,
    inserted.rows[0] as ExistingSupplierSales
  );
}

export async function runSupplierImport(
  rows: ParsedSpreadsheetRow[],
  mode: ImportDuplicateMode,
  db: Queryable,
  options: { commit: boolean }
): Promise<{
  previewRows: ImportPreviewRow[];
  commitSummary: ImportCommitSummary;
}> {
  const suppRes = await db.query(
    `SELECT id, name, code, contact_person, phone, email, address, city, notes, is_active
     FROM suppliers`
  );
  const salesRes = await db.query(
    `SELECT id, supplier_id, name, email, is_active, phones, notes
     FROM supplier_sales`
  );

  const supplierByCode = new Map<string, ExistingSupplier>();
  const supplierByName = new Map<string, ExistingSupplier[]>();
  const usedLowerCodes = new Set<string>();

  for (const s of suppRes.rows as ExistingSupplier[]) {
    if (s.code) {
      const lower = s.code.trim().toLowerCase();
      supplierByCode.set(lower, s);
      usedLowerCodes.add(lower);
    }
    const nameKey = normalizeWhitespace(s.name).toLowerCase();
    const list = supplierByName.get(nameKey) ?? [];
    list.push(s);
    supplierByName.set(nameKey, list);
  }

  const salesByKey = new Map<string, ExistingSupplierSales>();
  for (const sl of salesRes.rows as ExistingSupplierSales[]) {
    const key = `${sl.supplier_id}::${normalizeWhitespace(sl.name).toLowerCase()}`;
    salesByKey.set(key, sl);
  }

  // Track supplier groups within the file
  const groupCanonical = new Map<
    string,
    {
      fields: ParsedSupplierFields;
      firstRowNumber: number;
      isPreExistingInDb: boolean;
      resolvedSupplier: ExistingSupplier | null;
      alreadyInsertedInCommit: boolean;
      alreadyUpdatedInCommit: boolean;
    }
  >();
  const seenSalesInFile = new Map<string, number>();

  const previewRows: ImportPreviewRow[] = [];
  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const row of rows) {
    const messages: ImportCellIssue[] = [];

    const code = parseTextCell(row.values.kode_supplier);
    const rawName = parseTextCell(row.values.nama_supplier);
    const name = rawName ? normalizeWhitespace(rawName) : '';
    const contactPerson = parseTextCell(row.values.kontak_utama);
    const phone = parseTextCell(row.values.telepon_kantor);
    const email = parseTextCell(row.values.email_supplier);
    const city = parseTextCell(row.values.kota);
    const address = parseTextCell(row.values.alamat);
    const notes = parseTextCell(row.values.catatan_supplier);
    const rawSupplierStatus = row.values.status_supplier;

    const salesNameRaw = parseTextCell(row.values.nama_sales);
    const salesName = salesNameRaw ? normalizeWhitespace(salesNameRaw) : null;
    const salesEmail = parseTextCell(row.values.email_sales);
    const salesPhonesRaw = parseTextCell(row.values.no_hp_sales);
    const salesNotes = parseTextCell(row.values.catatan_sales);
    const rawSalesStatus = row.values.status_sales;

    // Validasi supplier
    if (code && code.length > 50) {
      messages.push({
        severity: 'error',
        field: 'kode_supplier',
        code: 'MAX_LENGTH',
        message: 'Kode supplier maksimal 50 karakter.',
      });
    }
    if (!name) {
      messages.push({
        severity: 'error',
        field: 'nama_supplier',
        code: 'REQUIRED',
        message: 'Nama supplier wajib diisi.',
      });
    } else if (name.length > 150) {
      messages.push({
        severity: 'error',
        field: 'nama_supplier',
        code: 'MAX_LENGTH',
        message: 'Nama supplier maksimal 150 karakter.',
      });
    }
    if (contactPerson && contactPerson.length > 100) {
      messages.push({
        severity: 'error',
        field: 'kontak_utama',
        code: 'MAX_LENGTH',
        message: 'Kontak utama maksimal 100 karakter.',
      });
    }
    if (phone && phone.length > 50) {
      messages.push({
        severity: 'error',
        field: 'telepon_kantor',
        code: 'MAX_LENGTH',
        message: 'Telepon kantor maksimal 50 karakter.',
      });
    }
    if (!isValidOptionalEmail(email)) {
      messages.push({
        severity: 'error',
        field: 'email_supplier',
        code: 'INVALID_EMAIL',
        message: 'Format email supplier tidak valid atau melebihi 100 karakter.',
      });
    }
    if (city && city.length > 100) {
      messages.push({
        severity: 'error',
        field: 'kota',
        code: 'MAX_LENGTH',
        message: 'Nama kota maksimal 100 karakter.',
      });
    }

    let isActiveExplicit: boolean | null = null;
    if (
      rawSupplierStatus !== null &&
      rawSupplierStatus !== undefined &&
      String(rawSupplierStatus).trim() !== ''
    ) {
      const parsedStatus = parseBooleanFlag(rawSupplierStatus, true);
      if (!parsedStatus.ok) {
        messages.push({
          severity: 'error',
          field: 'status_supplier',
          code: 'INVALID_BOOLEAN',
          message: parsedStatus.error,
        });
      } else {
        isActiveExplicit = parsedStatus.value;
      }
    }

    // Validasi sales (jika ada field sales yang diisi)
    const hasSalesStatusExplicit =
      rawSalesStatus !== null &&
      rawSalesStatus !== undefined &&
      String(rawSalesStatus).trim() !== '';
    const hasAnySalesField = Boolean(
      salesName || salesEmail || salesPhonesRaw || salesNotes || hasSalesStatusExplicit
    );

    let salesStatusExplicit: boolean | null = null;
    let salesPhones: ParsedSalesPhone[] = [];

    if (hasAnySalesField) {
      if (!salesName) {
        messages.push({
          severity: 'error',
          field: 'nama_sales',
          code: 'REQUIRED',
          message: 'Nama sales wajib diisi jika data kontak sales diisi.',
        });
      } else if (salesName.length > 150) {
        messages.push({
          severity: 'error',
          field: 'nama_sales',
          code: 'MAX_LENGTH',
          message: 'Nama sales maksimal 150 karakter.',
        });
      }

      if (!isValidOptionalEmail(salesEmail)) {
        messages.push({
          severity: 'error',
          field: 'email_sales',
          code: 'INVALID_EMAIL',
          message: 'Format email sales tidak valid atau melebihi 100 karakter.',
        });
      }

      if (salesPhonesRaw) {
        salesPhones = parseSalesPhones(salesPhonesRaw);
      }

      if (hasSalesStatusExplicit) {
        const parsedSalesStatus = parseBooleanFlag(rawSalesStatus, true);
        if (!parsedSalesStatus.ok) {
          messages.push({
            severity: 'error',
            field: 'status_sales',
            code: 'INVALID_BOOLEAN',
            message: parsedSalesStatus.error,
          });
        } else {
          salesStatusExplicit = parsedSalesStatus.value;
        }
      }
    }

    const groupKey = code ? `code:${code.toLowerCase()}` : `name:${name.toLowerCase()}`;

    // Resolusi supplier dari DB & konsistensi dalam file
    let existingSupplier: ExistingSupplier | null = null;
    if (!messages.some((m) => m.severity === 'error')) {
      const existingGroup = groupCanonical.get(groupKey);
      if (existingGroup) {
        // Cek konflik field non-kosong antar baris supplier yang sama
        const first = existingGroup.fields;
        const conflicts: string[] = [];
        if (name && first.name.toLowerCase() !== name.toLowerCase()) {
          conflicts.push('nama_supplier');
        }
        if (city && first.city && first.city.toLowerCase() !== city.toLowerCase()) {
          conflicts.push('kota');
        }
        if (phone && first.phone && first.phone !== phone) {
          conflicts.push('telepon_kantor');
        }
        if (
          email &&
          first.email &&
          first.email.toLowerCase() !== email.toLowerCase()
        ) {
          conflicts.push('email_supplier');
        }
        if (conflicts.length > 0) {
          messages.push({
            severity: 'error',
            field: conflicts[0],
            code: 'INCONSISTENT_GROUP',
            message: `Kolom ${conflicts.join(', ')} berbeda dengan baris ${existingGroup.firstRowNumber} untuk supplier yang sama.`,
          });
        }
        existingSupplier = existingGroup.resolvedSupplier;
      } else {
        if (code) {
          existingSupplier = supplierByCode.get(code.toLowerCase()) || null;
        } else {
          const matches = supplierByName.get(name.toLowerCase()) ?? [];
          if (matches.length === 1) {
            existingSupplier = matches[0];
          } else if (matches.length > 1) {
            messages.push({
              severity: 'error',
              field: 'nama_supplier',
              code: 'AMBIGUOUS_SUPPLIER',
              message: `Nama supplier "${name}" cocok dengan ${matches.length} data di database. Isi kolom kode_supplier agar unik.`,
            });
          }
        }
      }
    }

    // Cek duplikasi sales dalam file
    let isDuplicateSalesInFile = false;
    if (!messages.some((m) => m.severity === 'error') && salesName) {
      const fileSalesKey = `${groupKey}::${salesName.toLowerCase()}`;
      const prevRow = seenSalesInFile.get(fileSalesKey);
      if (prevRow !== undefined) {
        isDuplicateSalesInFile = true;
        messages.push({
          severity: 'warning',
          field: 'nama_sales',
          code: 'DUPLICATE_IN_FILE',
          message: `Kontak sales "${salesName}" duplikat dengan baris ${prevRow} untuk supplier yang sama; baris ini dilewati.`,
        });
      } else {
        seenSalesInFile.set(fileSalesKey, row.row_number);
      }
    }

    if (messages.some((m) => m.severity === 'error')) {
      failedCount++;
      previewRows.push({
        row_number: row.row_number,
        status: 'error',
        action: 'invalid',
        identifier: code || name || null,
        label: salesName ? `${name || '-'} (${salesName})` : name || code,
        raw: row.values,
        messages,
      });
      continue;
    }

    let action: ImportRowAction = 'create';
    let groupEntry = groupCanonical.get(groupKey);
    if (!groupEntry) {
      groupEntry = {
        fields: {
          code,
          name,
          contactPerson,
          phone,
          email,
          city,
          address,
          notes,
          isActiveExplicit,
        },
        firstRowNumber: row.row_number,
        isPreExistingInDb: Boolean(existingSupplier),
        resolvedSupplier: existingSupplier,
        alreadyInsertedInCommit: false,
        alreadyUpdatedInCommit: false,
      };
      groupCanonical.set(groupKey, groupEntry);
    }

    let targetSupplier = groupEntry.resolvedSupplier;

    if (!groupEntry.isPreExistingInDb) {
      // Supplier baru (atau baris lanjutan dari supplier baru yang baru dibuat di file ini)
      if (!targetSupplier) {
        if (options.commit) {
          const finalCode = code || generateSupplierCode(name, usedLowerCodes);
          const newId = generateUUIDv7();
          const isActive = isActiveExplicit ?? true;
          const inserted = await db.query(
            `INSERT INTO suppliers (
               id, name, code, contact_person, phone, email, address, city, notes, is_active
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING *`,
            [
              newId,
              name,
              finalCode,
              contactPerson,
              phone,
              email,
              address,
              city,
              notes,
              isActive,
            ]
          );
          targetSupplier = inserted.rows[0] as ExistingSupplier;
          supplierByCode.set(finalCode.toLowerCase(), targetSupplier);
          const list = supplierByName.get(name.toLowerCase()) ?? [];
          list.push(targetSupplier);
          supplierByName.set(name.toLowerCase(), list);
        } else {
          targetSupplier = {
            id: `virtual-supp-${groupKey}`,
            name,
            code: code || `AUTO-${name.slice(0, 4).toUpperCase()}`,
            contact_person: contactPerson,
            phone,
            email,
            address,
            city,
            notes,
            is_active: isActiveExplicit ?? true,
          };
        }
        groupEntry.resolvedSupplier = targetSupplier;
        groupEntry.alreadyInsertedInCommit = true;
      }

      if (isDuplicateSalesInFile) {
        action = 'skip';
        skippedCount++;
      } else {
        action = 'create';
        if (salesName && options.commit) {
          await insertSupplierSalesRecord(db, salesByKey, targetSupplier.id, {
            name: salesName,
            email: salesEmail,
            isActive: salesStatusExplicit ?? true,
            phones: salesPhones,
            notes: salesNotes,
          });
        }
        createdCount++;
      }
    } else if (targetSupplier) {
      // Supplier sudah ada di DB sebelum file ini
      const existingSales = salesName
        ? salesByKey.get(`${targetSupplier.id}::${salesName.toLowerCase()}`)
        : undefined;

      if (mode === 'skip') {
        if (!salesName || isDuplicateSalesInFile) {
          action = 'skip';
          if (!isDuplicateSalesInFile) {
            messages.push({
              severity: 'warning',
              field: code ? 'kode_supplier' : 'nama_supplier',
              code: 'ALREADY_EXISTS',
              message: `Supplier "${targetSupplier.name}" sudah terdaftar, dilewati (mode skip).`,
            });
          }
          skippedCount++;
        } else if (existingSales) {
          action = 'skip';
          messages.push({
            severity: 'warning',
            field: 'nama_sales',
            code: 'ALREADY_EXISTS',
            message: `Supplier & sales "${salesName}" sudah terdaftar, dilewati (mode skip).`,
          });
          skippedCount++;
        } else {
          action = 'create';
          messages.push({
            severity: 'warning',
            field: 'kode_supplier',
            code: 'SUPPLIER_SKIPPED_SALES_ADDED',
            message: `Supplier "${targetSupplier.name}" sudah ada (profil dilewati), kontak sales baru "${salesName}" akan ditambahkan.`,
          });
          if (options.commit) {
            await insertSupplierSalesRecord(db, salesByKey, targetSupplier.id, {
              name: salesName,
              email: salesEmail,
              isActive: salesStatusExplicit ?? true,
              phones: salesPhones,
              notes: salesNotes,
            });
          }
          createdCount++;
        }
      } else {
        // mode === 'upsert'
        if (isDuplicateSalesInFile) {
          action = 'skip';
          skippedCount++;
        } else {
          action = 'update';
          if (!groupEntry.alreadyUpdatedInCommit) {
            if (options.commit) {
              const nextName = name || targetSupplier.name;
              const nextContact = contactPerson ?? targetSupplier.contact_person;
              const nextPhone = phone ?? targetSupplier.phone;
              const nextEmail = email ?? targetSupplier.email;
              const nextAddress = address ?? targetSupplier.address;
              const nextCity = city ?? targetSupplier.city;
              const nextNotes = notes ?? targetSupplier.notes;
              const nextActive = isActiveExplicit ?? targetSupplier.is_active;

              const updatedSupp = await db.query(
                `UPDATE suppliers SET
                   name = $1,
                   contact_person = $2,
                   phone = $3,
                   email = $4,
                   address = $5,
                   city = $6,
                   notes = $7,
                   is_active = $8,
                   updated_at = CURRENT_TIMESTAMP
                 WHERE id = $9
                 RETURNING *`,
                [
                  nextName,
                  nextContact,
                  nextPhone,
                  nextEmail,
                  nextAddress,
                  nextCity,
                  nextNotes,
                  nextActive,
                  targetSupplier.id,
                ]
              );
              targetSupplier = updatedSupp.rows[0] as ExistingSupplier;
              groupEntry.resolvedSupplier = targetSupplier;
            }
            groupEntry.alreadyUpdatedInCommit = true;
          }

          if (salesName) {
            if (existingSales) {
              if (options.commit) {
                const nextSalesEmail = salesEmail ?? existingSales.email;
                const nextSalesActive = salesStatusExplicit ?? existingSales.is_active;
                const nextSalesPhones =
                  salesPhones.length > 0 ? salesPhones : existingSales.phones;
                const nextSalesNotes = salesNotes ?? existingSales.notes;

                const updatedSales = await db.query(
                  `UPDATE supplier_sales SET
                     name = $1,
                     email = $2,
                     is_active = $3,
                     phones = $4,
                     notes = $5,
                     updated_at = CURRENT_TIMESTAMP
                   WHERE id = $6
                   RETURNING *`,
                  [
                    salesName,
                    nextSalesEmail,
                    nextSalesActive,
                    JSON.stringify(nextSalesPhones),
                    nextSalesNotes,
                    existingSales.id,
                  ]
                );
                salesByKey.set(
                  `${targetSupplier.id}::${salesName.toLowerCase()}`,
                  updatedSales.rows[0] as ExistingSupplierSales
                );
              }
            } else if (options.commit) {
              await insertSupplierSalesRecord(db, salesByKey, targetSupplier.id, {
                name: salesName,
                email: salesEmail,
                isActive: salesStatusExplicit ?? true,
                phones: salesPhones,
                notes: salesNotes,
              });
            }
          }
          updatedCount++;
        }
      }
    }

    previewRows.push({
      row_number: row.row_number,
      status: deriveRowStatus(action, messages),
      action,
      identifier: targetSupplier?.code || code || name,
      label: salesName ? `${name} — ${salesName}` : name,
      raw: row.values,
      normalized: {
        supplier_code: targetSupplier?.code || code,
        supplier_name: name,
        sales_name: salesName,
        sales_phones: salesPhones,
      },
      messages,
    });
  }

  return {
    previewRows,
    commitSummary: {
      total_rows: rows.length,
      processed_rows: createdCount + updatedCount + skippedCount,
      created_count: createdCount,
      updated_count: updatedCount,
      skipped_count: skippedCount,
      failed_count: failedCount,
    },
  };
}
