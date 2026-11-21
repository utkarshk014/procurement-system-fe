import { ExcelImport } from '../components/ExcelImport';

const LABELS: Record<string, string> = {
  item_desc: 'Description', item_code: 'Code', goods_service_item: 'Type', grp_cd: 'Item group', cat_cd: 'Category',
  manf_cd: 'Manufacturer', uom_cd: 'Unit', gst_applicable: 'GST applies', gst_hsn_code: 'HSN', gst_percentage: 'GST %',
  sgst_percentage: 'SGST %', cgst_percentage: 'CGST %', item_consumable: 'Consumable', item_is_spare: 'Spare', track_serial: 'Serial numbers',
};

const LISTS = { title: '', to: '/stock', place: 'Stock lists' };

/** Items from Excel: check the file, then import every ready row in one go. */
export default function ItemImportPage() {
  return (
    <ExcelImport
      title="Import items"
      subtitle="Add many items at once from an Excel (.xlsx) file."
      base="/api/v1/stock/items"
      singular="item"
      plural="items"
      templateName="items-import-template.xlsx"
      note={<>Use the template, or a file exported from the Items page. Group, unit, category and manufacturer are given by
        name from the stock lists. Yes/no columns take yes or no; GST is yes when left empty. Items already there (same
        description or code) are skipped.</>}
      keyLabel="Code"
      fieldLabels={LABELS}
      missing={{
        item_group: { ...LISTS, title: 'Item groups' }, uom: { ...LISTS, title: 'Units' },
        category: { ...LISTS, title: 'Categories' }, manufacturer: { ...LISTS, title: 'Manufacturers' },
      }}
      back={{ to: '/stock/items', label: 'Back to items' }}
    />
  );
}
