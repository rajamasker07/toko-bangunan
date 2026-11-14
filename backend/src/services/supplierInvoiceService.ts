import { Pool, PoolClient } from 'pg';
import { pool, query } from '../config/db.js';
import { generateUUIDv7 } from '../utils/uuid.js';

type Queryable = Pool | PoolClient;

export type InvoicePaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERDUE';

export interface SupplierInvoice {
  id: string;
  supplier_id: string;
  invoice_number: string;
  purchase_order_no: string | null;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  status: InvoicePaymentStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  days_until_due?: number;
  days_overdue?: number;
  is_overdue?: boolean;
  is_due_soon?: boolean;
}

export interface CreateInvoiceInput {
  invoice_number: string;
  purchase_order_no?: string | null;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  paid_amount?: number;
  notes?: string | null;
}

export interface UpdateInvoiceInput {
  invoice_number?: string;
  purchase_order_no?: string | null;
  invoice_date?: string;
  due_date?: string;
  total_amount?: number;
  paid_amount?: number;
  notes?: string | null;
}

export interface SupplierInvoiceSummary {
  total_invoices: number;
  unpaid_count: number;
  partial_count: number;
  paid_count: number;
  overdue_count: number;
  due_soon_count: number;
  total_invoice_amount: number;
  total_paid_amount: number;
  total_debt_amount: number;
}

function calculateInvoiceStatus(
  totalAmount: number,
  paidAmount: number,
  dueDateStr: string
): InvoicePaymentStatus {
  const total = Number(totalAmount) || 0;
  const paid = Number(paidAmount) || 0;

  if (paid >= total && total > 0) {
    return 'PAID';
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDateStr);
  due.setHours(0, 0, 0, 0);

  if (due.getTime() < now.getTime()) {
    return 'OVERDUE';
  }

  if (paid > 0) {
    return 'PARTIAL';
  }

  return 'UNPAID';
}

function enrichInvoice(row: any): SupplierInvoice {
  const total = Number(row.total_amount) || 0;
  const paid = Number(row.paid_amount) || 0;
  const remaining = Math.max(0, total - paid);

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(row.due_date);
  due.setHours(0, 0, 0, 0);

  const diffTime = due.getTime() - now.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  const isPaid = paid >= total && total > 0;
  const isOverdue = !isPaid && diffDays < 0;
  const isDueSoon = !isPaid && diffDays >= 0 && diffDays <= 7;

  let status: InvoicePaymentStatus = row.status;
  if (!isPaid) {
    if (isOverdue) status = 'OVERDUE';
    else if (paid > 0) status = 'PARTIAL';
    else status = 'UNPAID';
  } else {
    status = 'PAID';
  }

  return {
    id: row.id,
    supplier_id: row.supplier_id,
    invoice_number: row.invoice_number,
    purchase_order_no: row.purchase_order_no,
    invoice_date: row.invoice_date,
    due_date: row.due_date,
    total_amount: total,
    paid_amount: paid,
    remaining_amount: remaining,
    status,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    days_until_due: diffDays >= 0 ? diffDays : undefined,
    days_overdue: diffDays < 0 ? Math.abs(diffDays) : undefined,
    is_overdue: isOverdue,
    is_due_soon: isDueSoon,
  };
}

export class SupplierInvoiceService {
  static async getBySupplierId(
    supplierId: string,
    filters?: { status?: string; search?: string }
  ): Promise<SupplierInvoice[]> {
    const params: any[] = [supplierId];
    const conditions: string[] = ['supplier_id = $1'];

    if (filters?.search) {
      params.push(`%${filters.search.toLowerCase().trim()}%`);
      const pIdx = params.length;
      conditions.push(`(
        LOWER(invoice_number) LIKE $${pIdx} OR 
        LOWER(COALESCE(purchase_order_no, '')) LIKE $${pIdx} OR 
        LOWER(COALESCE(notes, '')) LIKE $${pIdx}
      )`);
    }

    const sql = `
      SELECT * FROM supplier_invoices
      WHERE ${conditions.join(' AND ')}
      ORDER BY 
        CASE 
          WHEN (total_amount - paid_amount) > 0 AND due_date < CURRENT_DATE THEN 1
          WHEN (total_amount - paid_amount) > 0 THEN 2
          ELSE 3
        END ASC,
        due_date ASC,
        created_at DESC
    `;

    const res = await query(sql, params);
    let invoices = res.rows.map(enrichInvoice);

    if (filters?.status && filters.status !== 'all') {
      invoices = invoices.filter((inv) => inv.status.toLowerCase() === filters.status?.toLowerCase());
    }

    return invoices;
  }

  static async getSummaryBySupplierId(supplierId: string): Promise<SupplierInvoiceSummary> {
    const invoices = await this.getBySupplierId(supplierId);

    const summary: SupplierInvoiceSummary = {
      total_invoices: invoices.length,
      unpaid_count: invoices.filter((i) => i.status === 'UNPAID').length,
      partial_count: invoices.filter((i) => i.status === 'PARTIAL').length,
      paid_count: invoices.filter((i) => i.status === 'PAID').length,
      overdue_count: invoices.filter((i) => i.is_overdue).length,
      due_soon_count: invoices.filter((i) => i.is_due_soon).length,
      total_invoice_amount: invoices.reduce((acc, i) => acc + i.total_amount, 0),
      total_paid_amount: invoices.reduce((acc, i) => acc + i.paid_amount, 0),
      total_debt_amount: invoices.reduce((acc, i) => acc + i.remaining_amount, 0),
    };

    return summary;
  }

  static async create(supplierId: string, input: CreateInvoiceInput, db: Queryable = pool): Promise<SupplierInvoice> {
    const invNumber = input.invoice_number?.trim();
    if (!invNumber) throw new Error('Nomor nota / invoice wajib diisi');
    if (!input.invoice_date) throw new Error('Tanggal nota wajib diisi');
    if (!input.due_date) throw new Error('Tanggal jatuh tempo nota wajib diisi');

    const totalAmount = Number(input.total_amount) || 0;
    if (totalAmount <= 0) throw new Error('Total nilai nota harus lebih besar dari 0');

    const paidAmount = Number(input.paid_amount) || 0;
    if (paidAmount < 0) throw new Error('Jumlah dibayar tidak boleh negatif');
    if (paidAmount > totalAmount) throw new Error('Jumlah dibayar tidak boleh melebihi total nota');

    const status = calculateInvoiceStatus(totalAmount, paidAmount, input.due_date);
    const id = generateUUIDv7();

    const sql = `
      INSERT INTO supplier_invoices (
        id, supplier_id, invoice_number, purchase_order_no, invoice_date, due_date,
        total_amount, paid_amount, status, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const res = await db.query(sql, [
      id,
      supplierId,
      invNumber,
      input.purchase_order_no?.trim() || null,
      input.invoice_date,
      input.due_date,
      totalAmount,
      paidAmount,
      status,
      input.notes?.trim() || null,
    ]);

    return enrichInvoice(res.rows[0]);
  }

  static async update(id: string, input: UpdateInvoiceInput, db: Queryable = pool): Promise<SupplierInvoice | null> {
    const existingRes = await db.query('SELECT * FROM supplier_invoices WHERE id = $1', [id]);
    if (!existingRes.rows[0]) return null;
    const existing = existingRes.rows[0];

    const invNumber = input.invoice_number !== undefined ? input.invoice_number.trim() : existing.invoice_number;
    if (!invNumber) throw new Error('Nomor nota / invoice wajib diisi');

    const poNo = input.purchase_order_no !== undefined ? input.purchase_order_no?.trim() || null : existing.purchase_order_no;
    const invDate = input.invoice_date || existing.invoice_date;
    const dueDate = input.due_date || existing.due_date;
    const totalAmount = input.total_amount !== undefined ? Number(input.total_amount) : Number(existing.total_amount);
    const paidAmount = input.paid_amount !== undefined ? Number(input.paid_amount) : Number(existing.paid_amount);
    const notes = input.notes !== undefined ? input.notes?.trim() || null : existing.notes;

    if (totalAmount <= 0) throw new Error('Total nilai nota harus lebih besar dari 0');
    if (paidAmount < 0) throw new Error('Jumlah dibayar tidak boleh negatif');
    if (paidAmount > totalAmount) throw new Error('Jumlah dibayar tidak boleh melebihi total nota');

    const status = calculateInvoiceStatus(totalAmount, paidAmount, dueDate);

    const sql = `
      UPDATE supplier_invoices
      SET invoice_number = $1,
          purchase_order_no = $2,
          invoice_date = $3,
          due_date = $4,
          total_amount = $5,
          paid_amount = $6,
          status = $7,
          notes = $8,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $9
      RETURNING *
    `;

    const res = await db.query(sql, [
      invNumber,
      poNo,
      invDate,
      dueDate,
      totalAmount,
      paidAmount,
      status,
      notes,
      id,
    ]);

    return enrichInvoice(res.rows[0]);
  }

  static async recordPayment(id: string, amount: number, db: Queryable = pool): Promise<SupplierInvoice | null> {
    const payAmt = Number(amount);
    if (payAmt <= 0) throw new Error('Jumlah pembayaran harus lebih besar dari 0');

    const existingRes = await db.query('SELECT * FROM supplier_invoices WHERE id = $1', [id]);
    if (!existingRes.rows[0]) return null;
    const existing = existingRes.rows[0];

    const currentPaid = Number(existing.paid_amount) || 0;
    const totalAmount = Number(existing.total_amount) || 0;
    const newPaid = currentPaid + payAmt;

    if (newPaid > totalAmount) {
      throw new Error(`Pembayaran melebihi sisa tagihan. Sisa tagihan: Rp ${(totalAmount - currentPaid).toLocaleString('id-ID')}`);
    }

    const status = calculateInvoiceStatus(totalAmount, newPaid, existing.due_date);

    const sql = `
      UPDATE supplier_invoices
      SET paid_amount = $1,
          status = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `;

    const res = await db.query(sql, [newPaid, status, id]);
    return enrichInvoice(res.rows[0]);
  }

  static async delete(id: string, db: Queryable = pool): Promise<boolean> {
    const res = await db.query('DELETE FROM supplier_invoices WHERE id = $1 RETURNING id', [id]);
    return (res.rowCount ?? 0) > 0;
  }
}
