import type { Permission, PermissionCatalogItem, PermissionGroup } from '../types/auth.js';

export const PERMISSION_CATALOG: PermissionCatalogItem[] = [
  // Dashboard
  {
    id: 'dashboard:read',
    label: 'Lihat Dashboard',
    description: 'Melihat ringkasan metrik toko, omset penjualan, dan grafik analitik',
    module: 'Dashboard',
  },
  // Produk & Variasi
  {
    id: 'products:read',
    label: 'Lihat Katalog Produk',
    description: 'Melihat daftar produk, stok gudang, dan harga jual produk',
    module: 'Produk & Variasi',
  },
  {
    id: 'products:create',
    label: 'Tambah Produk',
    description: 'Menambahkan produk dan variasi baru ke katalog toko',
    module: 'Produk & Variasi',
  },
  {
    id: 'products:update',
    label: 'Ubah Data Produk',
    description: 'Mengubah nama produk, kategori, merek, dan spesifikasi varian',
    module: 'Produk & Variasi',
  },
  {
    id: 'products:delete',
    label: 'Hapus Produk',
    description: 'Menghapus produk dan varian dari katalog toko',
    module: 'Produk & Variasi',
  },
  {
    id: 'products:view_buy_price',
    label: 'Lihat Harga Modal / Beli',
    description: 'Melihat harga pokok pembelian (HPP) / harga beli produk dari supplier',
    module: 'Produk & Variasi',
  },
  // Harga & Satuan
  {
    id: 'pricing:write',
    label: 'Kelola Harga Bertingkat',
    description: 'Menambah, mengubah, dan menghapus harga jual satuan bertingkat (multi-satuan)',
    module: 'Harga & Satuan',
  },
  // Master Data
  {
    id: 'master:read',
    label: 'Lihat Master Data',
    description: 'Melihat daftar satuan ukuran, kategori material, dan merek produk',
    module: 'Master Data',
  },
  {
    id: 'master:write',
    label: 'Kelola Master Data',
    description: 'Menambah dan mengubah satuan ukuran, kategori, dan merek produk',
    module: 'Master Data',
  },
  {
    id: 'master:delete',
    label: 'Hapus Master Data',
    description: 'Menghapus satuan ukuran, kategori, dan merek produk',
    module: 'Master Data',
  },
  // Supplier
  {
    id: 'suppliers:read',
    label: 'Lihat Supplier & Sales',
    description: 'Melihat data kontak distributor, pemasok, dan tim sales supplier',
    module: 'Pemasok (Supplier)',
  },
  // Stok
  {
    id: 'stock:read',
    label: 'Lihat Mutasi Stok',
    description: 'Melihat buku kartu stok dan riwayat seluruh mutasi persediaan',
    module: 'Manajemen Stok',
  },
  {
    id: 'stock:adjust',
    label: 'Penyesuaian Stok (Opname)',
    description: 'Melakukan stock opname fisik dan koreksi penyesuaian jumlah stok',
    module: 'Manajemen Stok',
  },
  // Reservasi / Titip Barang
  {
    id: 'reservations:read',
    label: 'Lihat Reservasi Titip Barang',
    description: 'Melihat daftar nota titip barang, status pengambilan, dan alert jatuh tempo',
    module: 'Titip Barang (Reservasi)',
  },
  {
    id: 'reservations:create',
    label: 'Buat Nota Reservasi',
    description: 'Membuat pesanan titipan simpan stok untuk pelanggan dengan batas tempo',
    module: 'Titip Barang (Reservasi)',
  },
  {
    id: 'reservations:pickup',
    label: 'Proses Pengambilan Titipan',
    description: 'Menyerahkan barang bertahap/penuh dan memperpanjang batas tempo titipan',
    module: 'Titip Barang (Reservasi)',
  },
  {
    id: 'reservations:cancel',
    label: 'Batal & Selesaikan Sisa',
    description: 'Membatalkan nota reservasi atau menyelesaikan sebagian serta melepas sisa stok',
    module: 'Titip Barang (Reservasi)',
  },
  // Pengguna
  {
    id: 'users:read',
    label: 'Lihat Daftar Pengguna',
    description: 'Melihat daftar staf dan akun pengguna sistem',
    module: 'Akun Pengguna',
  },
  {
    id: 'users:manage',
    label: 'Kelola Pengguna',
    description: 'Menambah akun, mengubah data, reset password, dan aktivasi akun bawahan',
    module: 'Akun Pengguna',
  },
  {
    id: 'users:delete',
    label: 'Hapus Akun Pengguna',
    description: 'Menghapus akun staf dari sistem (khusus Owner)',
    module: 'Akun Pengguna',
  },
  // Role & RBAC
  {
    id: 'roles:manage',
    label: 'Kelola Peran & Hak Akses (RBAC)',
    description: 'Membuat, mengubah, dan menghapus peran serta konfigurasi hak akses pengguna',
    module: 'Peran & Hak Akses',
  },
];

export function getPermissionGroups(): PermissionGroup[] {
  const groupMap = new Map<string, PermissionCatalogItem[]>();
  for (const item of PERMISSION_CATALOG) {
    const list = groupMap.get(item.module) ?? [];
    list.push(item);
    groupMap.set(item.module, list);
  }

  return Array.from(groupMap.entries()).map(([module, permissions]) => ({
    module,
    permissions,
  }));
}
