import type {
  ImportCellIssue,
  ImportCommitSummary,
  ImportDuplicateMode,
  ImportExecutionContext,
  ImportPreviewRow,
  ImportRowAction,
  ParsedSpreadsheetRow,
} from '../../types/import.js';
import { brandKey, normalizeBrandName } from '../../utils/brand.js';
import {
  normalizeWhitespace,
  parseBooleanFlag,
  parseLocaleNumber,
  parseTextCell,
} from '../../utils/spreadsheetParser.js';
import { generateUUIDv7 } from '../../utils/uuid.js';
import { BrandService } from '../brandService.js';
import { PriceHistoryService } from '../priceHistoryService.js';
import { normalizeUnitName, unitKey, UnitService } from '../unitService.js';
import {
  CategoryRegistry,
  cleanRawSpreadsheetValues,
  deriveRowStatus,
  type Queryable,
} from './shared.js';

interface ExistingProduct {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  category_id: string | null;
  brand_id: string | null;
  supplier_id: string | null;
  description: string | null;
  min_stock_alert: string | number;
  is_active: boolean;
  has_variants: boolean;
  weight: string | number | null;
  length: string | number | null;
  width: string | number | null;
  height: string | number | null;
  material: string | null;
  specifications: string | null;
}

interface ExistingVariant {
  id: string;
  product_id: string;
  variant_name: string;
  sku: string;
  barcode: string | null;
  current_stock: string | number;
  reserved_stock: string | number;
  min_stock: string | number;
  is_active: boolean;
  attributes?: Record<string, string>;
}

interface ExistingVariantUnit {
  id: string;
  variant_id: string;
  unit_name: string;
  conversion_factor: string | number;
  is_base_unit: boolean;
  buy_price: string | number;
  sell_price: string | number;
  wholesale_price: string | number | null;
}

interface ExistingSupplierRef {
  id: string;
  name: string;
  code: string | null;
}

interface ParsedProductRow {
  row: ParsedSpreadsheetRow;
  messages: ImportCellIssue[];
  skuProduk: string;
  skuProdukLower: string;
  namaProduk: string | null;
  kategori: string | null;
  merek: string | null;
  kodeSupplier: string | null;
  resolvedSupplierId: string | null;
  barcodeProduk: string | null;
  minStockAlert: number | null;
  statusProduk: boolean | null;
  deskripsi: string | null;
  weight: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  material: string | null;
  specifications: string | null;
  skuVarianRaw: string | null;
  namaVarianRaw: string | null;
  barcodeVarian: string | null;
  atributVarianRaw: string | null;
  attributesParsed: Record<string, string>;
  stokAwal: number | null;
  minStockVarian: number | null;
  statusVarian: boolean | null;
  namaSatuan: string | null;
  unitKeyNorm: string | null;
  satuanDasar: boolean | null;
  faktorKonversi: number;
  hargaBeli: number | null;
  hargaJual: number | null;
  hargaGrosir: number | null;
  // Resolved during grouping
  resolvedVariantSku: string;
  resolvedVariantName: string;
  resolvedIsBaseUnit: boolean;
  action: ImportRowAction;
}

function parseOptionalNonNegNumber(
  raw: unknown,
  field: string,
  label: string,
  messages: ImportCellIssue[],
  options?: { positiveOnly?: boolean }
): number | null {
  const parsed = parseLocaleNumber(raw);
  if (!parsed.ok) {
    messages.push({
      severity: 'error',
      field,
      code: 'INVALID_NUMBER',
      message: `${label}: ${parsed.error}`,
    });
    return null;
  }
  if (parsed.value === null) return null;
  if (options?.positiveOnly ? parsed.value <= 0 : parsed.value < 0) {
    messages.push({
      severity: 'error',
      field,
      code: 'OUT_OF_RANGE',
      message: options?.positiveOnly
        ? `${label} harus lebih besar dari 0.`
        : `${label} tidak boleh bernilai negatif.`,
    });
    return null;
  }
  return parsed.value;
}

function parseOptionalBool(
  raw: unknown,
  field: string,
  messages: ImportCellIssue[]
): boolean | null {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return null;
  }
  const res = parseBooleanFlag(raw, true);
  if (!res.ok) {
    messages.push({
      severity: 'error',
      field,
      code: 'INVALID_BOOLEAN',
      message: res.error,
    });
    return null;
  }
  return res.value;
}

function hasRowErrors(messages: ImportCellIssue[]): boolean {
  return messages.some((m) => m.severity === 'error');
}

export function parseAttributeString(raw: string | null | undefined): Record<string, string> {
  if (!raw || typeof raw !== 'string') return {};
  const result: Record<string, string> = {};
  // Split by pipe '|', newline, or comma if pattern is 'key: value'
  const segments = raw.split(/[|\n]/).map((s) => s.trim()).filter(Boolean);
  for (const seg of segments) {
    const colonIdx = seg.indexOf(':');
    if (colonIdx > 0) {
      const key = seg.slice(0, colonIdx).trim();
      const val = seg.slice(colonIdx + 1).trim();
      if (key && val) {
        result[key] = val;
      }
    }
  }
  return result;
}

export async function runProductImport(
  rows: ParsedSpreadsheetRow[],
  mode: ImportDuplicateMode,
  db: Queryable,
  ctx: ImportExecutionContext,
  options: { commit: boolean; skipInvalidRows?: boolean }
): Promise<{
  previewRows: ImportPreviewRow[];
  commitSummary: ImportCommitSummary;
  autoCreateDependencies: { categories: string[]; brands: string[]; units: string[] };
  autoCreatedCounts: { categories: number; brands: number; units: number };
}> {
  // 1. Batch preload seluruh tabel referensi & katalog (berurutan agar aman pada single PoolClient)
  const categoryRegistry = await CategoryRegistry.load(db);
  const brandsRes = await db.query('SELECT id, name, name_key FROM brands');
  const unitsRes = await db.query('SELECT id, name, name_key FROM units');
  const suppliersRes = await db.query('SELECT id, name, code FROM suppliers');

  // Optimasi performa skala besar: Kumpulkan seluruh kandidat SKU dari baris import.
  // Hindari query 'SELECT * FROM products' tanpa filter yang dapat menyebabkan memory leak/freeze pada DB besar.
  const candidateSkus = Array.from(
    new Set(
      rows
        .flatMap((r) => {
          const pSku = parseTextCell(r.values.sku_produk)?.trim().toLowerCase();
          const vSku = parseTextCell(r.values.sku_varian)?.trim().toLowerCase();
          const list: string[] = [];
          if (pSku) {
            list.push(pSku);
            list.push(`${pSku}-std`);
          }
          if (vSku) list.push(vSku);
          return list;
        })
        .filter(Boolean) as string[]
    )
  );

  let productsRes: { rows: any[] };
  let variantsRes: { rows: any[] };
  let variantUnitsRes: { rows: any[] };

  if (candidateSkus.length > 0) {
    productsRes = await db.query(
      `SELECT * FROM products WHERE LOWER(sku) = ANY($1::text[])`,
      [candidateSkus]
    );

    variantsRes = await db.query(
      `SELECT pv.* FROM product_variants pv
       WHERE LOWER(pv.sku) = ANY($1::text[])
          OR pv.product_id IN (
            SELECT p.id FROM products p WHERE LOWER(p.sku) = ANY($1::text[])
          )`,
      [candidateSkus]
    );

    const variantIds = (variantsRes.rows as ExistingVariant[]).map((v) => v.id);
    if (variantIds.length > 0) {
      variantUnitsRes = await db.query(
        `SELECT * FROM variant_units WHERE variant_id = ANY($1::uuid[])`,
        [variantIds]
      );
    } else {
      variantUnitsRes = { rows: [] };
    }
  } else {
    productsRes = { rows: [] };
    variantsRes = { rows: [] };
    variantUnitsRes = { rows: [] };
  }

  const brandByKey = new Map<string, { id: string; name: string; name_key: string }>();
  for (const b of brandsRes.rows as Array<{ id: string; name: string; name_key: string }>) {
    brandByKey.set(b.name_key, b);
  }

  const unitByKey = new Map<string, { id: string; name: string; name_key: string }>();
  for (const u of unitsRes.rows as Array<{ id: string; name: string; name_key: string }>) {
    unitByKey.set(u.name_key, u);
  }

  const supplierByCode = new Map<string, ExistingSupplierRef>();
  const supplierByName = new Map<string, ExistingSupplierRef[]>();
  for (const s of suppliersRes.rows as ExistingSupplierRef[]) {
    if (s.code) supplierByCode.set(s.code.trim().toLowerCase(), s);
    const nameKey = normalizeWhitespace(s.name).toLowerCase();
    const list = supplierByName.get(nameKey) ?? [];
    list.push(s);
    supplierByName.set(nameKey, list);
  }

  const productByLowerSku = new Map<string, ExistingProduct>();
  for (const p of productsRes.rows as ExistingProduct[]) {
    productByLowerSku.set(p.sku.trim().toLowerCase(), p);
  }

  const variantByLowerSku = new Map<string, ExistingVariant>();
  const variantsByProductId = new Map<string, ExistingVariant[]>();
  for (const v of variantsRes.rows as ExistingVariant[]) {
    variantByLowerSku.set(v.sku.trim().toLowerCase(), v);
    const list = variantsByProductId.get(v.product_id) ?? [];
    list.push(v);
    variantsByProductId.set(v.product_id, list);
  }

  const unitsByVariantId = new Map<string, Map<string, ExistingVariantUnit>>();
  for (const vu of variantUnitsRes.rows as ExistingVariantUnit[]) {
    let map = unitsByVariantId.get(vu.variant_id);
    if (!map) {
      map = new Map<string, ExistingVariantUnit>();
      unitsByVariantId.set(vu.variant_id, map);
    }
    map.set(unitKey(vu.unit_name), vu);
  }

  // 2. Parsing & validasi sintaks per baris
  const parsedRows: ParsedProductRow[] = [];
  const productGroups = new Map<string, ParsedProductRow[]>();

  for (const row of rows) {
    const messages: ImportCellIssue[] = [];
    const skuProdukRaw = parseTextCell(row.values.sku_produk);
    const skuProduk = skuProdukRaw ? skuProdukRaw.trim() : '';

    if (!skuProduk) {
      messages.push({
        severity: 'error',
        field: 'sku_produk',
        code: 'REQUIRED',
        message: 'SKU produk wajib diisi.',
      });
    } else if (skuProduk.length > 100) {
      messages.push({
        severity: 'error',
        field: 'sku_produk',
        code: 'MAX_LENGTH',
        message: 'SKU produk maksimal 100 karakter.',
      });
    }

    const namaProdukRaw = parseTextCell(row.values.nama_produk);
    const namaProduk = namaProdukRaw ? normalizeWhitespace(namaProdukRaw) : null;
    if (namaProduk && namaProduk.length > 255) {
      messages.push({
        severity: 'error',
        field: 'nama_produk',
        code: 'MAX_LENGTH',
        message: 'Nama produk maksimal 255 karakter.',
      });
    }

    const kategori = parseTextCell(row.values.kategori);
    const merekRaw = parseTextCell(row.values.merek);
    const merek = merekRaw ? normalizeBrandName(merekRaw) : null;
    if (merek && merek.length > 100) {
      messages.push({
        severity: 'error',
        field: 'merek',
        code: 'MAX_LENGTH',
        message: 'Nama merek maksimal 100 karakter.',
      });
    }

    const kodeSupplier = parseTextCell(row.values.kode_supplier);
    let resolvedSupplierId: string | null = null;
    if (kodeSupplier) {
      const byCode = supplierByCode.get(kodeSupplier.toLowerCase());
      if (byCode) {
        resolvedSupplierId = byCode.id;
      } else {
        const byNameList = supplierByName.get(normalizeWhitespace(kodeSupplier).toLowerCase()) ?? [];
        if (byNameList.length === 1) {
          resolvedSupplierId = byNameList[0].id;
        } else if (byNameList.length > 1) {
          messages.push({
            severity: 'error',
            field: 'kode_supplier',
            code: 'AMBIGUOUS_SUPPLIER',
            message: `Nama supplier "${kodeSupplier}" cocok dengan beberapa supplier; gunakan kode_supplier.`,
          });
        } else {
          messages.push({
            severity: 'error',
            field: 'kode_supplier',
            code: 'SUPPLIER_NOT_FOUND',
            message: `Supplier "${kodeSupplier}" belum terdaftar di Master Supplier.`,
          });
        }
      }
    }

    const barcodeProduk = parseTextCell(row.values.barcode_produk);
    if (barcodeProduk && barcodeProduk.length > 100) {
      messages.push({
        severity: 'error',
        field: 'barcode_produk',
        code: 'MAX_LENGTH',
        message: 'Barcode produk maksimal 100 karakter.',
      });
    }

    const minStockAlert = parseOptionalNonNegNumber(
      row.values.stok_minimum_produk,
      'stok_minimum_produk',
      'Stok minimum produk',
      messages
    );
    const statusProduk = parseOptionalBool(row.values.status_produk, 'status_produk', messages);
    const deskripsi = parseTextCell(row.values.deskripsi);
    const weight = parseOptionalNonNegNumber(row.values.berat_kg, 'berat_kg', 'Berat (kg)', messages);
    const length = parseOptionalNonNegNumber(
      row.values.panjang_cm,
      'panjang_cm',
      'Panjang (cm)',
      messages
    );
    const width = parseOptionalNonNegNumber(row.values.lebar_cm, 'lebar_cm', 'Lebar (cm)', messages);
    const height = parseOptionalNonNegNumber(
      row.values.tinggi_cm,
      'tinggi_cm',
      'Tinggi (cm)',
      messages
    );
    const material = parseTextCell(row.values.material);
    if (material && material.length > 150) {
      messages.push({
        severity: 'error',
        field: 'material',
        code: 'MAX_LENGTH',
        message: 'Material maksimal 150 karakter.',
      });
    }
    const specifications = parseTextCell(row.values.spesifikasi);

    const skuVarianRaw = parseTextCell(row.values.sku_varian);
    if (skuVarianRaw && skuVarianRaw.length > 100) {
      messages.push({
        severity: 'error',
        field: 'sku_varian',
        code: 'MAX_LENGTH',
        message: 'SKU varian maksimal 100 karakter.',
      });
    }
    const namaVarianRaw = parseTextCell(row.values.nama_varian);
    if (namaVarianRaw && namaVarianRaw.length > 150) {
      messages.push({
        severity: 'error',
        field: 'nama_varian',
        code: 'MAX_LENGTH',
        message: 'Nama varian maksimal 150 karakter.',
      });
    }
    const barcodeVarian = parseTextCell(row.values.barcode_varian);
    if (barcodeVarian && barcodeVarian.length > 100) {
      messages.push({
        severity: 'error',
        field: 'barcode_varian',
        code: 'MAX_LENGTH',
        message: 'Barcode varian maksimal 100 karakter.',
      });
    }

    const atributVarianRaw = parseTextCell(row.values.atribut_varian);
    const attributesParsed = parseAttributeString(atributVarianRaw);

    const stokAwal = parseOptionalNonNegNumber(row.values.stok_awal, 'stok_awal', 'Stok awal', messages);
    const minStockVarian = parseOptionalNonNegNumber(
      row.values.stok_minimum_varian,
      'stok_minimum_varian',
      'Stok minimum varian',
      messages
    );
    const statusVarian = parseOptionalBool(row.values.status_varian, 'status_varian', messages);

    const namaSatuanRaw = parseTextCell(row.values.nama_satuan);
    const namaSatuan = namaSatuanRaw ? normalizeUnitName(namaSatuanRaw) : null;
    if (!namaSatuan) {
      messages.push({
        severity: 'error',
        field: 'nama_satuan',
        code: 'REQUIRED',
        message: 'Nama satuan wajib diisi.',
      });
    } else if (namaSatuan.length > 50) {
      messages.push({
        severity: 'error',
        field: 'nama_satuan',
        code: 'MAX_LENGTH',
        message: 'Nama satuan maksimal 50 karakter.',
      });
    }

    const satuanDasar = parseOptionalBool(row.values.satuan_dasar, 'satuan_dasar', messages);
    const faktorKonversiRaw = parseOptionalNonNegNumber(
      row.values.faktor_konversi,
      'faktor_konversi',
      'Faktor konversi',
      messages,
      { positiveOnly: true }
    );
    const faktorKonversi = faktorKonversiRaw ?? 1;

    if (satuanDasar === true && faktorKonversi !== 1) {
      messages.push({
        severity: 'error',
        field: 'faktor_konversi',
        code: 'BASE_UNIT_FACTOR_MUST_BE_ONE',
        message: 'Satuan dasar (satuan_dasar = YA) wajib memiliki faktor_konversi = 1.',
      });
    }

    const hargaBeli = parseOptionalNonNegNumber(
      row.values.harga_beli,
      'harga_beli',
      'Harga beli',
      messages
    );
    if (hargaBeli !== null && hargaBeli > 0 && !ctx.allowBuyPrice) {
      messages.push({
        severity: 'warning',
        field: 'harga_beli',
        code: 'BUY_PRICE_IGNORED',
        message:
          'Anda tidak memiliki izin "products:view_buy_price"; nilai harga beli akan diabaikan.',
      });
    }

    const hargaJual = parseOptionalNonNegNumber(
      row.values.harga_jual,
      'harga_jual',
      'Harga jual',
      messages
    );
    if (hargaJual === null && !messages.some((m) => m.field === 'harga_jual')) {
      messages.push({
        severity: 'error',
        field: 'harga_jual',
        code: 'REQUIRED',
        message: 'Harga jual wajib diisi.',
      });
    }

    const hargaGrosir = parseOptionalNonNegNumber(
      row.values.harga_grosir,
      'harga_grosir',
      'Harga grosir',
      messages
    );

    const parsedRow: ParsedProductRow = {
      row,
      messages,
      skuProduk,
      skuProdukLower: skuProduk.toLowerCase(),
      namaProduk,
      kategori,
      merek,
      kodeSupplier,
      resolvedSupplierId,
      barcodeProduk,
      minStockAlert,
      statusProduk,
      deskripsi,
      weight,
      length,
      width,
      height,
      material,
      specifications,
      skuVarianRaw,
      namaVarianRaw,
      barcodeVarian,
      atributVarianRaw,
      attributesParsed,
      stokAwal,
      minStockVarian,
      statusVarian,
      namaSatuan,
      unitKeyNorm: namaSatuan ? unitKey(namaSatuan) : null,
      satuanDasar,
      faktorKonversi,
      hargaBeli,
      hargaJual,
      hargaGrosir,
      resolvedVariantSku: skuVarianRaw || (skuProduk ? `${skuProduk}-STD` : ''),
      resolvedVariantName: namaVarianRaw || 'Standar',
      resolvedIsBaseUnit: Boolean(satuanDasar),
      action: hasRowErrors(messages) ? 'invalid' : 'create',
    };

    parsedRows.push(parsedRow);
    if (skuProduk) {
      const grp = productGroups.get(parsedRow.skuProdukLower) ?? [];
      grp.push(parsedRow);
      productGroups.set(parsedRow.skuProdukLower, grp);
    }
  }

  // 3. Validasi antar-baris per Product Group & Variant Group + Pelacakan Auto-Create Master
  const fileVariantSkuOwner = new Map<string, { skuProdukLower: string; rowNumber: number }>();
  const autoCreatedBrandKeys = new Set<string>();
  const autoCreatedBrandNames: string[] = [];
  const autoCreatedUnitKeys = new Set<string>();
  const autoCreatedUnitNames: string[] = [];

  interface PreparedProductGroup {
    skuProduk: string;
    skuProdukLower: string;
    existingProduct: ExistingProduct | null;
    rows: ParsedProductRow[];
    canonicalProduct: {
      name: string;
      kategori: string | null;
      merek: string | null;
      supplierId: string | null;
      barcode: string | null;
      minStockAlert: number | null;
      isActive: boolean | null;
      description: string | null;
      weight: number | null;
      length: number | null;
      width: number | null;
      height: number | null;
      material: string | null;
      specifications: string | null;
    };
    variantGroups: Map<string, ParsedProductRow[]>;
    skipEntireProduct: boolean;
  }

  const preparedGroups: PreparedProductGroup[] = [];

  for (const [skuProdukLower, grpRows] of productGroups.entries()) {
    const firstRow = grpRows[0];
    const existingProduct = productByLowerSku.get(skuProdukLower) || null;
    const dbVariants = existingProduct ? variantsByProductId.get(existingProduct.id) ?? [] : [];

    // Jika mode skip dan produk sudah ada di DB
    if (existingProduct && mode === 'skip') {
      for (const r of grpRows) {
        if (!hasRowErrors(r.messages)) {
          r.action = 'skip';
          r.messages.push({
            severity: 'warning',
            field: 'sku_produk',
            code: 'ALREADY_EXISTS',
            message: `Produk SKU "${existingProduct.sku}" sudah terdaftar, dilewati (mode skip).`,
          });
        }
      }
      preparedGroups.push({
        skuProduk: firstRow.skuProduk,
        skuProdukLower,
        existingProduct,
        rows: grpRows,
        canonicalProduct: {
          name: existingProduct.name,
          kategori: null,
          merek: null,
          supplierId: existingProduct.supplier_id,
          barcode: existingProduct.barcode,
          minStockAlert: Number(existingProduct.min_stock_alert),
          isActive: existingProduct.is_active,
          description: existingProduct.description,
          weight: null,
          length: null,
          width: null,
          height: null,
          material: existingProduct.material,
          specifications: existingProduct.specifications,
        },
        variantGroups: new Map(),
        skipEntireProduct: true,
      });
      continue;
    }

    // Kumpulkan atribut produk dari baris pertama yang mengisi nilai non-null
    const firstName = grpRows.find((r) => r.namaProduk)?.namaProduk || existingProduct?.name || null;
    if (!firstName) {
      firstRow.messages.push({
        severity: 'error',
        field: 'nama_produk',
        code: 'REQUIRED',
        message: 'Nama produk wajib diisi pada baris pertama produk baru.',
      });
    }

    const firstKategori = grpRows.find((r) => r.kategori)?.kategori || null;
    const firstMerek = grpRows.find((r) => r.merek)?.merek || null;
    const firstSupplier = grpRows.find((r) => r.resolvedSupplierId) || null;
    const firstBarcode = grpRows.find((r) => r.barcodeProduk)?.barcodeProduk || null;
    const firstMinAlert = grpRows.find((r) => r.minStockAlert !== null)?.minStockAlert ?? null;
    const firstStatus = grpRows.find((r) => r.statusProduk !== null)?.statusProduk ?? null;
    const firstDesc = grpRows.find((r) => r.deskripsi)?.deskripsi || null;
    const firstWeight = grpRows.find((r) => r.weight !== null)?.weight ?? null;
    const firstLength = grpRows.find((r) => r.length !== null)?.length ?? null;
    const firstWidth = grpRows.find((r) => r.width !== null)?.width ?? null;
    const firstHeight = grpRows.find((r) => r.height !== null)?.height ?? null;
    const firstMaterial = grpRows.find((r) => r.material)?.material || null;
    const firstSpecs = grpRows.find((r) => r.specifications)?.specifications || null;

    // Cek konsistensi atribut level-produk antar baris grup yang sama
    for (const r of grpRows) {
      if (r.namaProduk && firstName && r.namaProduk.toLowerCase() !== firstName.toLowerCase()) {
        r.messages.push({
          severity: 'error',
          field: 'nama_produk',
          code: 'INCONSISTENT_PRODUCT',
          message: `Nama produk berbeda dengan baris pertama SKU "${firstRow.skuProduk}".`,
        });
      }
      if (r.kategori && firstKategori && r.kategori.toLowerCase() !== firstKategori.toLowerCase()) {
        r.messages.push({
          severity: 'error',
          field: 'kategori',
          code: 'INCONSISTENT_PRODUCT',
          message: `Kategori berbeda dengan baris pertama SKU "${firstRow.skuProduk}".`,
        });
      }
      if (r.merek && firstMerek && brandKey(r.merek) !== brandKey(firstMerek)) {
        r.messages.push({
          severity: 'error',
          field: 'merek',
          code: 'INCONSISTENT_PRODUCT',
          message: `Merek berbeda dengan baris pertama SKU "${firstRow.skuProduk}".`,
        });
      }
      if (
        r.resolvedSupplierId &&
        firstSupplier?.resolvedSupplierId &&
        r.resolvedSupplierId !== firstSupplier.resolvedSupplierId
      ) {
        r.messages.push({
          severity: 'error',
          field: 'kode_supplier',
          code: 'INCONSISTENT_PRODUCT',
          message: `Supplier berbeda dengan baris pertama SKU "${firstRow.skuProduk}".`,
        });
      }
    }

    // Tentukan key varian masing-masing baris
    const preliminaryVarKeys = new Set<string>();
    for (const r of grpRows) {
      if (r.skuVarianRaw) preliminaryVarKeys.add(`sku:${r.skuVarianRaw.toLowerCase()}`);
      else if (r.namaVarianRaw) preliminaryVarKeys.add(`name:${r.namaVarianRaw.toLowerCase()}`);
      else preliminaryVarKeys.add('default');
    }

    const isMultiVariantInFile = preliminaryVarKeys.size > 1;
    const isExistingMultiVariant = Boolean(
      existingProduct && (existingProduct.has_variants || dbVariants.length > 1)
    );

    const variantGroups = new Map<string, ParsedProductRow[]>();

    for (const r of grpRows) {
      if (!r.skuVarianRaw) {
        if (isMultiVariantInFile) {
          r.messages.push({
            severity: 'error',
            field: 'sku_varian',
            code: 'REQUIRED_FOR_MULTI_VARIANT',
            message: 'Produk dengan lebih dari 1 varian wajib mengisi kolom sku_varian.',
          });
        } else if (isExistingMultiVariant) {
          r.messages.push({
            severity: 'error',
            field: 'sku_varian',
            code: 'REQUIRED_FOR_MULTI_VARIANT',
            message: 'Produk multi-varian di database wajib menyertakan sku_varian yang dituju.',
          });
        } else if (dbVariants.length === 1) {
          // Produk tunggal existing (termasuk produk seed yang SKU variannya non-STD)
          r.resolvedVariantSku = dbVariants[0].sku;
          r.resolvedVariantName = r.namaVarianRaw || dbVariants[0].variant_name;
        } else {
          r.resolvedVariantSku = `${firstRow.skuProduk}-STD`;
          r.resolvedVariantName = r.namaVarianRaw || 'Standar';
        }
      } else {
        r.resolvedVariantSku = r.skuVarianRaw;
        r.resolvedVariantName = r.namaVarianRaw || r.skuVarianRaw;
      }

      const varSkuLower = r.resolvedVariantSku.toLowerCase();

      // Cek tabrakan SKU varian lintas produk di file maupun di DB
      const fileOwner = fileVariantSkuOwner.get(varSkuLower);
      if (fileOwner && fileOwner.skuProdukLower !== skuProdukLower) {
        r.messages.push({
          severity: 'error',
          field: 'sku_varian',
          code: 'VARIANT_SKU_CONFLICT',
          message: `SKU varian "${r.resolvedVariantSku}" bentrok dengan produk lain di baris ${fileOwner.rowNumber}.`,
        });
      } else if (!fileOwner) {
        fileVariantSkuOwner.set(varSkuLower, { skuProdukLower, rowNumber: r.row.row_number });
      }

      const dbVar = variantByLowerSku.get(varSkuLower);
      if (dbVar && (!existingProduct || dbVar.product_id !== existingProduct.id)) {
        r.messages.push({
          severity: 'error',
          field: 'sku_varian',
          code: 'VARIANT_SKU_TAKEN',
          message: `SKU varian "${r.resolvedVariantSku}" sudah dipakai oleh produk lain di database.`,
        });
      }

      const list = variantGroups.get(varSkuLower) ?? [];
      list.push(r);
      variantGroups.set(varSkuLower, list);
    }

    // Validasi setiap grup varian (konsistensi stok, unit duplikat, base unit, pricing RBAC)
    for (const [varSkuLower, vRows] of variantGroups.entries()) {
      const existingVariant = variantByLowerSku.get(varSkuLower) || null;
      const existingUnitsMap = existingVariant
        ? unitsByVariantId.get(existingVariant.id) ?? new Map<string, ExistingVariantUnit>()
        : new Map<string, ExistingVariantUnit>();

      // Konsistensi nama varian & stok awal antar baris satuan pada varian yang sama
      const firstVName = vRows.find((r) => r.namaVarianRaw)?.namaVarianRaw || null;
      const explicitStocks = vRows.filter((r) => r.stokAwal !== null);
      const firstStock = explicitStocks[0]?.stokAwal ?? null;

      for (const r of vRows) {
        if (
          r.namaVarianRaw &&
          firstVName &&
          r.namaVarianRaw.toLowerCase() !== firstVName.toLowerCase()
        ) {
          r.messages.push({
            severity: 'error',
            field: 'nama_varian',
            code: 'INCONSISTENT_VARIANT',
            message: `Nama varian berbeda pada SKU varian "${r.resolvedVariantSku}".`,
          });
        }
        if (r.stokAwal !== null && firstStock !== null && r.stokAwal !== firstStock) {
          r.messages.push({
            severity: 'error',
            field: 'stok_awal',
            code: 'INCONSISTENT_STOCK',
            message: `Stok awal (${r.stokAwal}) berbeda dengan baris lain (${firstStock}) pada SKU varian "${r.resolvedVariantSku}".`,
          });
        }
        if (
          existingVariant &&
          r.stokAwal !== null &&
          r.stokAwal !== Number(existingVariant.current_stock)
        ) {
          r.messages.push({
            severity: 'warning',
            field: 'stok_awal',
            code: 'STOCK_IGNORED_ON_UPSERT',
            message: `Varian sudah ada: stok awal (${r.stokAwal}) diabaikan saat upsert; stok berjalan (${existingVariant.current_stock}) dipertahankan.`,
          });
        }
        if (existingVariant && !ctx.allowPricingWrite) {
          r.messages.push({
            severity: 'error',
            field: 'harga_jual',
            code: 'PRICING_PERMISSION_REQUIRED',
            message:
              'Peran Anda tidak memiliki izin "pricing:write" untuk memperbarui/menambah satuan harga pada produk yang sudah ada.',
          });
        }
      }

      // Cek unit duplikat dalam varian yang sama di file
      const seenUnitKeys = new Map<string, number>();
      for (const r of vRows) {
        if (!r.unitKeyNorm) continue;
        const prev = seenUnitKeys.get(r.unitKeyNorm);
        if (prev !== undefined) {
          r.messages.push({
            severity: 'error',
            field: 'nama_satuan',
            code: 'DUPLICATE_UNIT_IN_VARIANT',
            message: `Duplikat satuan "${r.namaSatuan}" pada varian "${r.resolvedVariantSku}" (sudah ada di baris ${prev}).`,
          });
        } else {
          seenUnitKeys.set(r.unitKeyNorm, r.row.row_number);
        }
      }

      // Validasi satuan dasar (is_base_unit)
      const markedBaseRows = vRows.filter((r) => r.satuanDasar === true);
      if (markedBaseRows.length > 1) {
        for (const r of markedBaseRows) {
          r.messages.push({
            severity: 'error',
            field: 'satuan_dasar',
            code: 'MULTIPLE_BASE_UNITS',
            message: `Varian "${r.resolvedVariantSku}" hanya boleh memiliki 1 satuan dasar (satuan_dasar = YA).`,
          });
        }
      } else if (!existingVariant) {
        // Varian baru wajib punya tepat 1 base unit
        if (markedBaseRows.length === 1) {
          for (const r of vRows) {
            r.resolvedIsBaseUnit = r === markedBaseRows[0];
          }
        } else {
          const factorOneRows = vRows.filter((r) => r.faktorKonversi === 1);
          if (factorOneRows.length === 1) {
            for (const r of vRows) {
              r.resolvedIsBaseUnit = r === factorOneRows[0];
            }
          } else {
            for (const r of vRows) {
              r.messages.push({
                severity: 'error',
                field: 'satuan_dasar',
                code: 'MISSING_BASE_UNIT',
                message: `Tentukan tepat 1 satuan dasar untuk varian "${r.resolvedVariantSku}" (satuan_dasar = YA dan faktor_konversi = 1).`,
              });
            }
          }
        }
      } else {
        // Varian existing saat upsert
        const existingBase = Array.from(existingUnitsMap.values()).find((u) => u.is_base_unit);
        const existingBaseKey = existingBase ? unitKey(existingBase.unit_name) : null;

        if (markedBaseRows.length === 1) {
          const marked = markedBaseRows[0];
          if (
            existingBaseKey &&
            marked.unitKeyNorm &&
            marked.unitKeyNorm !== existingBaseKey &&
            (Number(existingVariant.current_stock) > 0 || Number(existingVariant.reserved_stock) > 0)
          ) {
            marked.messages.push({
              severity: 'error',
              field: 'satuan_dasar',
              code: 'BASE_UNIT_LOCKED_BY_STOCK',
              message: `Satuan dasar varian "${marked.resolvedVariantSku}" tidak dapat diubah ke "${marked.namaSatuan}" karena sudah memiliki stok (${existingVariant.current_stock}) atau reservasi (${existingVariant.reserved_stock}).`,
            });
          } else {
            for (const r of vRows) {
              r.resolvedIsBaseUnit = r === marked;
            }
          }
        } else {
          // Tidak ditandai eksplisit: ikuti status base unit di DB
          for (const r of vRows) {
            if (existingBaseKey && r.unitKeyNorm === existingBaseKey) {
              if (r.satuanDasar === false) {
                r.messages.push({
                  severity: 'error',
                  field: 'satuan_dasar',
                  code: 'CANNOT_UNSET_BASE_UNIT',
                  message: `Satuan "${r.namaSatuan}" adalah satuan dasar varian ini; tidak bisa diubah menjadi non-dasar tanpa menentukan penggantinya.`,
                });
              } else {
                r.resolvedIsBaseUnit = true;
              }
            } else {
              r.resolvedIsBaseUnit = false;
            }
          }
          if (!existingBase) {
            const factorOneRows = vRows.filter((r) => r.faktorKonversi === 1);
            if (factorOneRows.length === 1) {
              factorOneRows[0].resolvedIsBaseUnit = true;
            }
          }
        }
      }
    }

    // Resolusi/validasi kategori & catat auto-create master (hanya untuk grup tanpa error? Tetap cek kategori path!)
    if (firstKategori) {
      const catPreviewRes = await categoryRegistry.resolveCategoryPath(firstKategori, null, true);
      if (!catPreviewRes.ok) {
        for (const r of grpRows) {
          if (r.kategori || r === firstRow) {
            r.messages.push({
              severity: 'error',
              field: 'kategori',
              code: 'INVALID_CATEGORY_PATH',
              message: catPreviewRes.error,
            });
          }
        }
      }
    }

    if (firstMerek) {
      const bKey = brandKey(firstMerek);
      if (!brandByKey.has(bKey) && !autoCreatedBrandKeys.has(bKey)) {
        autoCreatedBrandKeys.add(bKey);
        autoCreatedBrandNames.push(firstMerek);
      }
    }

    for (const r of grpRows) {
      if (r.namaSatuan && r.unitKeyNorm) {
        if (!unitByKey.has(r.unitKeyNorm) && !autoCreatedUnitKeys.has(r.unitKeyNorm)) {
          autoCreatedUnitKeys.add(r.unitKeyNorm);
          autoCreatedUnitNames.push(r.namaSatuan);
        }
      }
    }

    // Tetapkan action per baris
    for (const r of grpRows) {
      if (hasRowErrors(r.messages)) {
        r.action = 'invalid';
      } else if (existingProduct) {
        r.action = 'update';
      } else {
        r.action = 'create';
      }
    }

    preparedGroups.push({
      skuProduk: firstRow.skuProduk,
      skuProdukLower,
      existingProduct,
      rows: grpRows,
      canonicalProduct: {
        name: firstName || firstRow.skuProduk,
        kategori: firstKategori,
        merek: firstMerek,
        supplierId: firstSupplier?.resolvedSupplierId ?? null,
        barcode: firstBarcode,
        minStockAlert: firstMinAlert,
        isActive: firstStatus,
        description: firstDesc,
        weight: firstWeight,
        length: firstLength,
        width: firstWidth,
        height: firstHeight,
        material: firstMaterial,
        specifications: firstSpecs,
      },
      variantGroups,
      skipEntireProduct: false,
    });
  }

  // 4. Eksekusi Commit Transaksional jika options.commit = true
  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let committedAutoCat = 0;
  let committedAutoBrand = 0;
  let committedAutoUnit = 0;

  if (options.commit) {
    const importBatchId = generateUUIDv7();
    // Reload category registry fresh for real DB writes (clear virtual dry-run nodes)
    const commitCategoryRegistry = await CategoryRegistry.load(db);

    for (const grp of preparedGroups) {
      if (grp.skipEntireProduct) {
        for (const r of grp.rows) {
          if (r.action === 'invalid') failedCount++;
          else skippedCount++;
        }
        continue;
      }

      const groupHasError = grp.rows.some((r) => hasRowErrors(r.messages));
      if (groupHasError) {
        // Jika grup produk punya error dan skipInvalidRows=true, jangan insert produk parsial
        for (const r of grp.rows) {
          if (hasRowErrors(r.messages)) {
            r.action = 'invalid';
            failedCount++;
          } else {
            r.action = 'skip';
            r.messages.push({
              severity: 'warning',
              field: 'sku_produk',
              code: 'GROUP_ABORTED',
              message: `Baris dilewati karena baris lain pada SKU produk "${grp.skuProduk}" memiliki error.`,
            });
            skippedCount++;
          }
        }
        continue;
      }

      // Resolve Category (auto-create jika belum ada)
      let resolvedCategoryId: string | null | undefined = undefined;
      if (grp.canonicalProduct.kategori) {
        const catRes = await commitCategoryRegistry.resolveCategoryPath(
          grp.canonicalProduct.kategori,
          db,
          true
        );
        if (!catRes.ok) {
          throw new Error(catRes.error);
        }
        resolvedCategoryId = catRes.category.id;
        committedAutoCat += catRes.autoCreatedCount;
      }

      // Resolve Brand (auto-create via BrandService.findOrCreate)
      let resolvedBrandId: string | null | undefined = undefined;
      if (grp.canonicalProduct.merek) {
        const { brand, created } = await BrandService.findOrCreate(grp.canonicalProduct.merek, db);
        resolvedBrandId = brand.id;
        if (created) committedAutoBrand++;
      }

      // Insert or Update Product
      let productId: string;
      const distinctVariantCount = grp.variantGroups.size;
      const existingVariantList = grp.existingProduct
        ? variantsByProductId.get(grp.existingProduct.id) ?? []
        : [];
      const mergedVariantSkus = new Set<string>(
        existingVariantList.map((v) => v.sku.trim().toLowerCase())
      );
      for (const vSkuLower of grp.variantGroups.keys()) {
        mergedVariantSkus.add(vSkuLower);
      }

      const hasVariants = grp.existingProduct
        ? Boolean(grp.existingProduct.has_variants || mergedVariantSkus.size > 1)
        : distinctVariantCount > 1;

      if (!grp.existingProduct) {
        productId = generateUUIDv7();
        await db.query(
          `INSERT INTO products (
             id, name, sku, barcode, category_id, brand_id, supplier_id,
             description, min_stock_alert, is_active, has_variants,
             weight, length, width, height, material, specifications
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
          [
            productId,
            grp.canonicalProduct.name,
            grp.skuProduk,
            grp.canonicalProduct.barcode,
            resolvedCategoryId ?? null,
            resolvedBrandId ?? null,
            grp.canonicalProduct.supplierId,
            grp.canonicalProduct.description,
            grp.canonicalProduct.minStockAlert ?? 5,
            grp.canonicalProduct.isActive ?? true,
            hasVariants,
            grp.canonicalProduct.weight,
            grp.canonicalProduct.length,
            grp.canonicalProduct.width,
            grp.canonicalProduct.height,
            grp.canonicalProduct.material,
            grp.canonicalProduct.specifications,
          ]
        );
      } else {
        productId = grp.existingProduct.id;
        const p = grp.existingProduct;
        await db.query(
          `UPDATE products SET
             name = $1,
             barcode = $2,
             category_id = $3,
             brand_id = $4,
             supplier_id = $5,
             description = $6,
             min_stock_alert = $7,
             is_active = $8,
             has_variants = $9,
             weight = $10,
             length = $11,
             width = $12,
             height = $13,
             material = $14,
             specifications = $15,
             updated_at = CURRENT_TIMESTAMP
           WHERE id = $16`,
          [
            grp.canonicalProduct.name || p.name,
            grp.canonicalProduct.barcode ?? p.barcode,
            resolvedCategoryId !== undefined ? resolvedCategoryId : p.category_id,
            resolvedBrandId !== undefined ? resolvedBrandId : p.brand_id,
            grp.canonicalProduct.supplierId ?? p.supplier_id,
            grp.canonicalProduct.description ?? p.description,
            grp.canonicalProduct.minStockAlert ?? p.min_stock_alert,
            grp.canonicalProduct.isActive ?? p.is_active,
            hasVariants,
            grp.canonicalProduct.weight ?? p.weight,
            grp.canonicalProduct.length ?? p.length,
            grp.canonicalProduct.width ?? p.width,
            grp.canonicalProduct.height ?? p.height,
            grp.canonicalProduct.material ?? p.material,
            grp.canonicalProduct.specifications ?? p.specifications,
            productId,
          ]
        );
      }

      // Insert or Update Variants + Units
      for (const [varSkuLower, vRows] of grp.variantGroups.entries()) {
        const existingVariant = variantByLowerSku.get(varSkuLower) || null;
        const vFirst = vRows[0];
        const vName = vRows.find((r) => r.namaVarianRaw)?.namaVarianRaw || vFirst.resolvedVariantName;
        const vBarcode = vRows.find((r) => r.barcodeVarian)?.barcodeVarian ?? null;
        const vMinStock =
          vRows.find((r) => r.minStockVarian !== null)?.minStockVarian ??
          grp.canonicalProduct.minStockAlert ??
          (grp.existingProduct ? Number(grp.existingProduct.min_stock_alert) : 5);
        const vActive = vRows.find((r) => r.statusVarian !== null)?.statusVarian ?? null;
        const vInitialStock = vRows.find((r) => r.stokAwal !== null)?.stokAwal ?? 0;
        const vAttributes = vRows.find((r) => r.attributesParsed && Object.keys(r.attributesParsed).length > 0)?.attributesParsed || {};

        let variantId: string;
        if (!existingVariant) {
          variantId = generateUUIDv7();
          await db.query(
            `INSERT INTO product_variants (
               id, product_id, variant_name, sku, barcode, current_stock, min_stock, is_active, attributes
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              variantId,
              productId,
              vName,
              vFirst.resolvedVariantSku,
              vBarcode ?? grp.canonicalProduct.barcode,
              vInitialStock,
              vMinStock,
              vActive ?? true,
              JSON.stringify(vAttributes),
            ]
          );

          if (vInitialStock > 0) {
            await db.query(
              `INSERT INTO stock_movements (
                 id, product_id, variant_id, movement_type, previous_stock, quantity_change,
                 current_stock, reference_no, notes, created_by, user_id
               ) VALUES ($1, $2, $3, 'INITIAL_STOCK', 0, $4, $4, $5, 'Stok awal dari import data', $6, $7)`,
              [
                generateUUIDv7(),
                productId,
                variantId,
                vInitialStock,
                `IMP-${vFirst.resolvedVariantSku}`.slice(0, 100),
                ctx.createdBy.slice(0, 100),
                ctx.userId || null,
              ]
            );
          }
        } else {
          variantId = existingVariant.id;
          const mergedAttrs = {
            ...(existingVariant.attributes && typeof existingVariant.attributes === 'object' ? existingVariant.attributes : {}),
            ...vAttributes,
          };
          // Jangan pernah menimpa current_stock / reserved_stock pada upsert!
          await db.query(
            `UPDATE product_variants SET
               variant_name = $1,
               barcode = $2,
               min_stock = $3,
               is_active = $4,
               attributes = $5,
               updated_at = CURRENT_TIMESTAMP
             WHERE id = $6`,
            [
              vRows.find((r) => r.namaVarianRaw)?.namaVarianRaw || existingVariant.variant_name,
              vBarcode ?? existingVariant.barcode,
              vRows.find((r) => r.minStockVarian !== null)?.minStockVarian ?? existingVariant.min_stock,
              vActive ?? existingVariant.is_active,
              JSON.stringify(mergedAttrs),
              variantId,
            ]
          );
        }

        const existingUnitsMap =
          unitsByVariantId.get(variantId) ?? new Map<string, ExistingVariantUnit>();

        // Jika ada unit baru/update yang jadi base unit, demote base unit lama dulu
        const nextBaseRow = vRows.find((r) => r.resolvedIsBaseUnit);
        if (nextBaseRow && existingVariant) {
          await db.query(
            `UPDATE variant_units SET is_base_unit = FALSE, updated_at = CURRENT_TIMESTAMP
             WHERE variant_id = $1 AND is_base_unit = TRUE`,
            [variantId]
          );
        }

        for (const r of vRows) {
          const { unit, created } = await UnitService.findOrCreate(r.namaSatuan!, undefined, db);
          if (created) committedAutoUnit++;

          const existingUnit = existingUnitsMap.get(r.unitKeyNorm!);
          if (!existingUnit) {
            const unitId = generateUUIDv7();
            const buyVal = ctx.allowBuyPrice ? (r.hargaBeli ?? 0) : 0;
            const sellVal = r.hargaJual ?? 0;
            const wholesaleVal = r.hargaGrosir;

            await db.query(
              `INSERT INTO variant_units (
                 id, variant_id, unit_name, conversion_factor, is_base_unit,
                 buy_price, sell_price, wholesale_price
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                unitId,
                variantId,
                unit.name,
                r.faktorKonversi,
                r.resolvedIsBaseUnit,
                buyVal,
                sellVal,
                wholesaleVal,
              ]
            );

            await PriceHistoryService.recordChange(db as any, {
              productId,
              variantId,
              variantUnitId: unitId,
              unitName: unit.name,
              supplierId: grp.canonicalProduct.supplierId || null,
              newBuyPrice: buyVal,
              newSellPrice: sellVal,
              newWholesalePrice: wholesaleVal,
              changeSource: 'INITIAL_PRICE',
              batchId: importBatchId,
              referenceNo: ctx.filename || null,
              reason: ctx.filename ? `Import produk: penambahan satuan baru (${ctx.filename})` : 'Import produk: penambahan satuan baru',
              userId: ctx.userId,
              createdBy: ctx.createdBy,
            });
          } else {
            const oldBuy = Number(existingUnit.buy_price) || 0;
            const oldSell = Number(existingUnit.sell_price) || 0;
            const oldWholesale = existingUnit.wholesale_price !== null ? Number(existingUnit.wholesale_price) : null;

            const nextBuyPrice = ctx.allowBuyPrice
              ? (r.hargaBeli ?? oldBuy)
              : oldBuy;
            const nextSellPrice = r.hargaJual ?? oldSell;
            const nextWholesalePrice = r.hargaGrosir !== null && r.hargaGrosir !== undefined
              ? r.hargaGrosir
              : (existingUnit.wholesale_price !== null ? Number(existingUnit.wholesale_price) : null);

            await db.query(
              `UPDATE variant_units SET
                 unit_name = $1,
                 conversion_factor = $2,
                 is_base_unit = $3,
                 buy_price = $4,
                 sell_price = $5,
                 wholesale_price = $6,
                 updated_at = CURRENT_TIMESTAMP
               WHERE id = $7`,
              [
                unit.name,
                r.faktorKonversi,
                r.resolvedIsBaseUnit,
                nextBuyPrice,
                nextSellPrice,
                nextWholesalePrice,
                existingUnit.id,
              ]
            );

            await PriceHistoryService.recordChange(db as any, {
              productId,
              variantId,
              variantUnitId: existingUnit.id,
              unitName: unit.name,
              supplierId: grp.canonicalProduct.supplierId || null,
              oldBuyPrice: oldBuy,
              newBuyPrice: nextBuyPrice,
              oldSellPrice: oldSell,
              newSellPrice: nextSellPrice,
              oldWholesalePrice: oldWholesale,
              newWholesalePrice: nextWholesalePrice,
              changeSource: 'EXCEL_IMPORT',
              batchId: importBatchId,
              referenceNo: ctx.filename || null,
              reason: ctx.filename ? `Import data produk (${ctx.filename})` : 'Import data produk',
              userId: ctx.userId,
              createdBy: ctx.createdBy,
            });
          }
        }
      }

      // Update variant_options for product based on variant attributes
      const allAttrsRes = await db.query(
        `SELECT attributes FROM product_variants WHERE product_id = $1`,
        [productId]
      );
      const keysSet = new Set<string>();
      for (const row of allAttrsRes.rows) {
        if (row.attributes && typeof row.attributes === 'object') {
          Object.keys(row.attributes).forEach((k) => {
            if (k && k.trim()) keysSet.add(k.trim());
          });
        }
      }
      if (keysSet.size > 0) {
        await db.query(
          `UPDATE products SET variant_options = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [JSON.stringify(Array.from(keysSet)), productId]
        );
      }

      for (const r of grp.rows) {
        if (r.action === 'create') createdCount++;
        else if (r.action === 'update') updatedCount++;
      }
    }

    // Hitung baris yang gagal tanpa sku_produk (tidak masuk productGroups)
    for (const r of parsedRows) {
      if (!r.skuProduk) {
        failedCount++;
      }
    }
  } else {
    for (const r of parsedRows) {
      if (r.action === 'invalid') failedCount++;
      else if (r.action === 'create') createdCount++;
      else if (r.action === 'update') updatedCount++;
      else if (r.action === 'skip') skippedCount++;
    }
  }

  const previewRows: ImportPreviewRow[] = parsedRows.map((r) => ({
    row_number: r.row.row_number,
    status: deriveRowStatus(r.action, r.messages),
    action: r.action,
    identifier: r.skuProduk ? `${r.skuProduk} / ${r.resolvedVariantSku}` : null,
    label: r.namaProduk
      ? `${r.namaProduk}${r.namaSatuan ? ` (${r.namaSatuan})` : ''}`
      : r.namaSatuan
        ? `${r.skuProduk || '-'} (${r.namaSatuan})`
        : r.skuProduk || null,
    raw: cleanRawSpreadsheetValues(r.row.values),
    normalized:
      r.action !== 'invalid'
        ? {
            sku_produk: r.skuProduk,
            sku_varian: r.resolvedVariantSku,
            nama_varian: r.resolvedVariantName,
            nama_satuan: r.namaSatuan,
            is_base_unit: r.resolvedIsBaseUnit,
            faktor_konversi: r.faktorKonversi,
            harga_jual: r.hargaJual,
          }
        : undefined,
    messages: r.messages,
  }));

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
        categories: committedAutoCat,
        brands: committedAutoBrand,
        units: committedAutoUnit,
      },
    },
    autoCreateDependencies: {
      categories: categoryRegistry.getAutoCreatedPaths(),
      brands: autoCreatedBrandNames,
      units: autoCreatedUnitNames,
    },
    autoCreatedCounts: {
      categories: committedAutoCat,
      brands: committedAutoBrand,
      units: committedAutoUnit,
    },
  };
}
