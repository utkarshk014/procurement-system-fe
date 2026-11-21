import { ExcelImport } from '../components/ExcelImport';

const LABELS: Record<string, string> = {
  name: 'Name', vendor_type: 'Vendor type', supply_type: 'Supplies', item_groups: 'Item groups', pin: 'PIN',
  mobile: 'Phone', email: 'Email', website: 'Website', reg_date: 'Registered on', company_since: 'In business since',
  is_manufacturer: 'Manufacturer', is_contruction_comp: 'Construction company', pan: 'PAN', gstin: 'GSTIN', tan: 'TAN',
  correspond_email: 'Correspondence email', correspond_mobile: 'Correspondence mobile',
  ...Object.fromEntries([1, 2, 3].flatMap((n) => [
    [`contact_${n}_person`, `Contact ${n}`], [`contact_${n}_designation`, `Contact ${n} designation`],
    [`contact_${n}_mobile`, `Contact ${n} mobile`], [`contact_${n}_email`, `Contact ${n} email`],
  ])),
};

/** Vendors from Excel: details, contacts and item groups. Financials and certificates are added per vendor. */
export default function VendorImportPage() {
  return (
    <ExcelImport
      title="Import vendors"
      subtitle="Add many vendors at once from an Excel (.xlsx) file."
      base="/api/v1/vendors"
      singular="vendor"
      plural="vendors"
      templateName="vendors-import-template.xlsx"
      note={<>Use the template, or a file exported from the Vendors page. Item groups are names from the item groups list,
        separated by commas. Financials and certificates are added on each vendor's page afterwards. Vendors already there
        (same name, PAN or GSTIN) are skipped.</>}
      keyLabel="PAN"
      fieldLabels={LABELS}
      missing={{ item_groups: { title: 'Item groups', to: '/stock', place: 'Stock lists' } }}
      back={{ to: '/vendors', label: 'Back to vendors' }}
    />
  );
}
