import React, { useMemo } from 'react';
import { UnitMaster } from '../../types';
import { SearchableSelect, SearchableOption } from './SearchableSelect';
import { Scale } from 'lucide-react';

export interface UnitSelectProps {
  value: string;
  onChange: (value: string) => void;
  units: UnitMaster[];
  onAddNewUnit?: (name: string) => Promise<void> | void;
  placeholder?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export const UnitSelect: React.FC<UnitSelectProps> = ({
  value,
  onChange,
  units,
  onAddNewUnit,
  placeholder = 'Pilih satuan...',
  disabled = false,
  size = 'md',
  className = '',
}) => {
  const options: SearchableOption[] = useMemo(() => {
    return units.map((u) => ({
      value: u.name,
      label: u.name,
      subtitle: u.description || undefined,
    }));
  }, [units]);

  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      onAddNew={onAddNewUnit}
      addNewLabel={(q) => `Tambah "${q}" sebagai Satuan Baru`}
      placeholder={placeholder}
      searchPlaceholder="Cari atau ketik satuan..."
      disabled={disabled}
      size={size}
      className={className}
      icon={Scale}
      iconColor="text-amber-500"
    />
  );
};
