import { Request, Response } from 'express';
import { SupplierInvoiceService } from '../services/supplierInvoiceService.js';

export class SupplierInvoiceController {
  static async listBySupplier(req: Request, res: Response) {
    try {
      const supplierId = String(req.params.supplierId);
      const status = req.query.status as string;
      const search = req.query.search as string;

      const invoices = await SupplierInvoiceService.getBySupplierId(supplierId, {
        status,
        search,
      });

      res.json({ success: true, data: invoices });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getSummaryBySupplier(req: Request, res: Response) {
    try {
      const supplierId = String(req.params.supplierId);
      const summary = await SupplierInvoiceService.getSummaryBySupplierId(supplierId);
      res.json({ success: true, data: summary });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const supplierId = String(req.params.supplierId);
      const { invoice_number, purchase_order_no, invoice_date, due_date, total_amount, paid_amount, notes } = req.body;

      if (!invoice_number || !String(invoice_number).trim()) {
        return res.status(400).json({ success: false, message: 'Nomor nota / invoice wajib diisi' });
      }
      if (!invoice_date) {
        return res.status(400).json({ success: false, message: 'Tanggal nota wajib diisi' });
      }
      if (!due_date) {
        return res.status(400).json({ success: false, message: 'Tanggal jatuh tempo nota wajib diisi' });
      }
      if (!total_amount || Number(total_amount) <= 0) {
        return res.status(400).json({ success: false, message: 'Total nilai nota harus lebih besar dari 0' });
      }

      const invoice = await SupplierInvoiceService.create(supplierId, {
        invoice_number,
        purchase_order_no,
        invoice_date,
        due_date,
        total_amount: Number(total_amount),
        paid_amount: paid_amount !== undefined ? Number(paid_amount) : 0,
        notes,
      });

      res.status(201).json({
        success: true,
        data: invoice,
        message: `Nota ${invoice.invoice_number} berhasil dicatat`,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const invoice = await SupplierInvoiceService.update(id, req.body);

      if (!invoice) {
        return res.status(404).json({ success: false, message: 'Nota supplier tidak ditemukan' });
      }

      res.json({
        success: true,
        data: invoice,
        message: `Nota ${invoice.invoice_number} berhasil diperbarui`,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async recordPayment(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const { amount } = req.body;

      if (!amount || Number(amount) <= 0) {
        return res.status(400).json({ success: false, message: 'Nominal pembayaran harus lebih besar dari 0' });
      }

      const invoice = await SupplierInvoiceService.recordPayment(id, Number(amount));
      if (!invoice) {
        return res.status(404).json({ success: false, message: 'Nota supplier tidak ditemukan' });
      }

      res.json({
        success: true,
        data: invoice,
        message: `Pembayaran sebesar Rp ${Number(amount).toLocaleString('id-ID')} berhasil dicatat`,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async delete(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const deleted = await SupplierInvoiceService.delete(id);

      if (!deleted) {
        return res.status(404).json({ success: false, message: 'Nota supplier tidak ditemukan' });
      }

      res.json({
        success: true,
        message: 'Nota supplier berhasil dihapus',
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
