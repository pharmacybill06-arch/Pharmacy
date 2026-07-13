export const DOSAGE_FORM_OPTIONS = [
  { value: 'tablet', label: 'Tablet' },
  { value: 'syrup', label: 'Syrup' },
  { value: 'cream', label: 'Cream' },
  { value: 'inhaler', label: 'Inhaler' },
  { value: 'insulin', label: 'Insulin' },
  { value: 'drops', label: 'Drops' },
];

export const DOSAGE_FORM_CONFIG = {
  tablet: {
    quantityLabel: 'tablets',
    daysLabel: 'days',
    fields: [
      { key: 'stripsDispensed', label: 'Strips dispensed', placeholder: '2', keyboardType: 'decimal-pad' },
      { key: 'tabletsPerStrip', label: 'Tablets / strip', placeholder: '15', keyboardType: 'decimal-pad' },
      { key: 'dosePerDay', label: 'Dose per day', placeholder: '1', keyboardType: 'decimal-pad' },
    ],
  },
  syrup: {
    quantityLabel: 'mL',
    daysLabel: 'days',
    fields: [
      { key: 'bottleSizeMl', label: 'Bottle size (mL)', placeholder: '100', keyboardType: 'decimal-pad' },
      { key: 'mlPerDose', label: 'mL per dose', placeholder: '10', keyboardType: 'decimal-pad' },
      { key: 'dosePerDay', label: 'Doses per day', placeholder: '2', keyboardType: 'decimal-pad' },
    ],
  },
  cream: {
    quantityLabel: 'g',
    daysLabel: 'days',
    fields: [
      { key: 'tubeSizeG', label: 'Tube size (g)', placeholder: '30', keyboardType: 'decimal-pad' },
      { key: 'gPerDose', label: 'g per dose', placeholder: '1', keyboardType: 'decimal-pad' },
      { key: 'dosePerDay', label: 'Doses per day', placeholder: '2', keyboardType: 'decimal-pad' },
    ],
  },
  inhaler: {
    quantityLabel: 'puffs',
    daysLabel: 'days',
    fields: [
      { key: 'inhalerCount', label: 'Inhaler count', placeholder: '1', keyboardType: 'decimal-pad' },
      { key: 'puffsPerDose', label: 'Puffs per dose', placeholder: '2', keyboardType: 'decimal-pad' },
      { key: 'dosePerDay', label: 'Doses per day', placeholder: '2', keyboardType: 'decimal-pad' },
    ],
  },
  insulin: {
    quantityLabel: 'units',
    daysLabel: 'days',
    fields: [
      { key: 'unitsPerVial', label: 'Units per vial', placeholder: '1000', keyboardType: 'decimal-pad' },
      { key: 'unitsPerDose', label: 'Units per dose', placeholder: '10', keyboardType: 'decimal-pad' },
      { key: 'dosePerDay', label: 'Doses per day', placeholder: '2', keyboardType: 'decimal-pad' },
    ],
  },
  drops: {
    quantityLabel: 'drops',
    daysLabel: 'days',
    fields: [
      { key: 'bottleSizeMl', label: 'Bottle size (mL)', placeholder: '10', keyboardType: 'decimal-pad' },
      { key: 'dropsPerDose', label: 'Drops per dose', placeholder: '2', keyboardType: 'decimal-pad' },
      { key: 'dosePerDay', label: 'Doses per day', placeholder: '3', keyboardType: 'decimal-pad' },
    ],
  },
};

export function normalizeDosageForm(value) {
  const form = String(value || 'tablet').toLowerCase();
  return DOSAGE_FORM_CONFIG[form] ? form : 'tablet';
}

export function toNumber(value) {
  const parsed = typeof value === 'string' ? parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getDosageFieldConfig(dosageForm) {
  return DOSAGE_FORM_CONFIG[normalizeDosageForm(dosageForm)];
}

export function getDosageSummary(medicine) {
  const form = normalizeDosageForm(medicine?.dosageForm);
  const details = medicine?.dosageDetails || medicine || {};

  if (form === 'tablet') {
    const stripsDispensed = toNumber(details.stripsDispensed ?? medicine?.stripsDispensed);
    const tabletsPerStrip = toNumber(details.tabletsPerStrip ?? medicine?.tabletsPerStrip);
    const dosePerDay = toNumber(details.dosePerDay ?? medicine?.dosePerDay);
    if (!stripsDispensed && !tabletsPerStrip && !dosePerDay) return 'No dosage details yet';
    return `${stripsDispensed} strips x ${tabletsPerStrip}/strip - ${dosePerDay}/day`;
  }

  if (form === 'syrup') {
    if (!toNumber(details.bottleSizeMl) && !toNumber(details.mlPerDose) && !toNumber(details.dosePerDay)) return 'No dosage details yet';
    return `${toNumber(details.bottleSizeMl)} mL bottle - ${toNumber(details.mlPerDose)} mL/dose - ${toNumber(details.dosePerDay)} doses/day`;
  }

  if (form === 'cream') {
    if (!toNumber(details.tubeSizeG) && !toNumber(details.gPerDose) && !toNumber(details.dosePerDay)) return 'No dosage details yet';
    return `${toNumber(details.tubeSizeG)} g tube - ${toNumber(details.gPerDose)} g/dose - ${toNumber(details.dosePerDay)} doses/day`;
  }

  if (form === 'inhaler') {
    if (!toNumber(details.inhalerCount) && !toNumber(details.puffsPerDose) && !toNumber(details.dosePerDay)) return 'No dosage details yet';
    return `${toNumber(details.inhalerCount)} inhaler${toNumber(details.inhalerCount) === 1 ? '' : 's'} - ${toNumber(details.puffsPerDose)} puffs/dose - ${toNumber(details.dosePerDay)} doses/day`;
  }

  if (form === 'insulin') {
    if (!toNumber(details.unitsPerVial) && !toNumber(details.unitsPerDose) && !toNumber(details.dosePerDay)) return 'No dosage details yet';
    return `${toNumber(details.unitsPerVial)} units/vial - ${toNumber(details.unitsPerDose)} units/dose - ${toNumber(details.dosePerDay)} doses/day`;
  }

  if (form === 'drops') {
    if (!toNumber(details.bottleSizeMl) && !toNumber(details.dropsPerDose) && !toNumber(details.dosePerDay)) return 'No dosage details yet';
    return `${toNumber(details.bottleSizeMl)} mL bottle - ${toNumber(details.dropsPerDose)} drops/dose - ${toNumber(details.dosePerDay)} doses/day`;
  }

  return 'No dosage details';
}

export function getPackQuantity(medicine) {
  const form = normalizeDosageForm(medicine?.dosageForm);
  const details = medicine?.dosageDetails || medicine || {};

  if (form === 'tablet') {
    return toNumber(details.stripsDispensed ?? medicine?.stripsDispensed) *
      toNumber(details.tabletsPerStrip ?? medicine?.tabletsPerStrip);
  }

  if (form === 'syrup') return toNumber(details.bottleSizeMl);
  if (form === 'cream') return toNumber(details.tubeSizeG);
  if (form === 'inhaler') return toNumber(details.inhalerCount);
  if (form === 'insulin') return toNumber(details.unitsPerVial);
  if (form === 'drops') return toNumber(details.bottleSizeMl);
  return 0;
}

export function getDailyUsageQuantity(medicine) {
  const form = normalizeDosageForm(medicine?.dosageForm);
  const details = medicine?.dosageDetails || medicine || {};

  if (form === 'tablet') return toNumber(details.dosePerDay ?? medicine?.dosePerDay);
  if (form === 'syrup') return toNumber(details.mlPerDose) * toNumber(details.dosePerDay);
  if (form === 'cream') return toNumber(details.gPerDose) * toNumber(details.dosePerDay);
  if (form === 'inhaler') return toNumber(details.puffsPerDose) * toNumber(details.dosePerDay);
  if (form === 'insulin') return toNumber(details.unitsPerDose) * toNumber(details.dosePerDay);
  if (form === 'drops') return toNumber(details.dropsPerDose) * toNumber(details.dosePerDay);
  return 0;
}

export function getDaysOfSupply(medicine) {
  const pack = getPackQuantity(medicine);
  const daily = getDailyUsageQuantity(medicine);
  if (!daily) return 0;
  return pack / daily;
}

export function buildDosageDetails(dosageForm, data = {}) {
  const form = normalizeDosageForm(dosageForm);

  if (form === 'tablet') {
    return {
      stripsDispensed: toNumber(data.stripsDispensed),
      tabletsPerStrip: toNumber(data.tabletsPerStrip),
      dosePerDay: toNumber(data.dosePerDay),
    };
  }

  if (form === 'syrup') {
    return {
      bottleSizeMl: toNumber(data.bottleSizeMl),
      mlPerDose: toNumber(data.mlPerDose),
      dosePerDay: toNumber(data.dosePerDay),
    };
  }

  if (form === 'cream') {
    return {
      tubeSizeG: toNumber(data.tubeSizeG),
      gPerDose: toNumber(data.gPerDose),
      dosePerDay: toNumber(data.dosePerDay),
    };
  }

  if (form === 'inhaler') {
    return {
      inhalerCount: toNumber(data.inhalerCount),
      puffsPerDose: toNumber(data.puffsPerDose),
      dosePerDay: toNumber(data.dosePerDay),
    };
  }

  if (form === 'insulin') {
    return {
      unitsPerVial: toNumber(data.unitsPerVial),
      unitsPerDose: toNumber(data.unitsPerDose),
      dosePerDay: toNumber(data.dosePerDay),
    };
  }

  if (form === 'drops') {
    return {
      bottleSizeMl: toNumber(data.bottleSizeMl),
      dropsPerDose: toNumber(data.dropsPerDose),
      dosePerDay: toNumber(data.dosePerDay),
    };
  }

  return {};
}
