import React from 'react';
import { FileSpreadsheet, ArrowLeft } from 'lucide-react';
import { ImportEntityType, ImportCommitResult } from '../types';
import { ImportWizard } from './ImportWizard';

interface ImportDataViewProps {
  initialEntity?: ImportEntityType;
  returnTabLabel?: string;
  onBack?: () => void;
  onImportSuccess?: (entity: ImportEntityType, result: ImportCommitResult) => void;
  onNavigateToEntity?: (entity: ImportEntityType) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const ImportDataView: React.FC<ImportDataViewProps> = ({
  initialEntity,
  returnTabLabel,
  onBack,
  onImportSuccess,
  onNavigateToEntity,
  showToast,
}) => {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-amber-500" />
            <span>Import Data Massal (Excel & CSV)</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Impor produk beserta varian & multi-satuan, supplier & tim sales, kategori bertingkat, dan merek dengan simulasi validasi sebelum disimpan
          </p>
        </div>

        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-sm self-start sm:self-auto"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{returnTabLabel ? `Kembali ke ${returnTabLabel}` : 'Kembali'}</span>
          </button>
        )}
      </div>

      {/* Reusable 4-Step Import Wizard */}
      <ImportWizard
        initialEntity={initialEntity}
        onImportSuccess={onImportSuccess}
        onNavigateToEntity={onNavigateToEntity}
        onBack={onBack}
        backLabel={returnTabLabel ? `Kembali ke ${returnTabLabel}` : undefined}
        showToast={showToast}
      />
    </div>
  );
};
