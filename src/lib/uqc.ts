/**
 * The GST list of unit quantity codes (as Tally shows it), stored as CODE-NAME in a unit's
 * standard name. The DBA asked for a fixed list, not free text. Keep in step with the backend's
 * src/internal/domain/stock/uqc.go, which refuses anything else.
 */
export const UQCS = [
  'BAG-BAGS', 'BAL-BALE', 'BDL-BUNDLES', 'BKL-BUCKLES', 'BOU-BILLION OF UNITS', 'BOX-BOX',
  'BTL-BOTTLES', 'BUN-BUNCHES', 'CAN-CANS', 'CBM-CUBIC METERS', 'CCM-CUBIC CENTIMETERS',
  'CMS-CENTIMETERS', 'CTN-CARTONS', 'DOZ-DOZENS', 'DRM-DRUMS', 'GGK-GREAT GROSS', 'GMS-GRAMMES',
  'GRS-GROSS', 'GYD-GROSS YARDS', 'KGS-KILOGRAMS', 'KLR-KILOLITRE', 'KME-KILOMETRE', 'LTR-LITRES',
  'MLT-MILILITRE', 'MTR-METERS', 'MTS-METRIC TON', 'NOS-NUMBERS', 'OTH-OTHERS', 'PAC-PACKS',
  'PCS-PIECES', 'PRS-PAIRS', 'QTL-QUINTAL', 'ROL-ROLLS', 'SET-SETS', 'SQF-SQUARE FEET',
  'SQM-SQUARE METERS', 'SQY-SQUARE YARDS', 'TBS-TABLETS', 'TGM-TEN GROSS', 'THD-THOUSANDS',
  'TON-TONNES', 'TUB-TUBES', 'UGS-US GALLONS', 'UNT-UNITS', 'YDS-YARDS',
] as const;

/** The code part of a UQC, e.g. KGS for KGS-KILOGRAMS. */
export const uqcCode = (uqc: string) => uqc.split('-')[0];
