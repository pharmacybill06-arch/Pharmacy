const ExcelJS = require('exceljs');

/**
 * Workbook Builder
 * Shared spreadsheet formatting for every export type.
 *
 * The rules encoded here exist because ERP imports and Excel itself are unforgiving:
 *   - Batch numbers MUST stay text. Excel turns "5P10775" into 5.10775E+06 and strips
 *     leading zeros off "007" unless the cell is explicitly text-typed.
 *   - Dates MUST be real Excel dates, numbers MUST be real numbers. ERP importers
 *     reject text-formatted numerics.
 *   - Blank means blank. Never "null", "undefined" or a 0 standing in for missing data.
 *   - CSV MUST carry a UTF-8 BOM or Excel on Windows mangles ₹ and Devanagari.
 */

const UTF8_BOM = '﻿';

// Column type contract used by every export definition
// { header, key, width, type: 'text'|'number'|'date'|'currency'|'percent' }

/**
 * Normalise a value for a cell. Anything absent becomes null, which ExcelJS renders
 * as a genuinely empty cell.
 */
function cellValue(raw, type) {
  if (raw === null || raw === undefined || raw === '') return null;

  switch (type) {
    case 'number':
    case 'currency':
    case 'percent': {
      const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[^0-9.-]/g, ''));
      return Number.isFinite(n) ? n : null;
    }
    case 'date': {
      const d = raw instanceof Date ? raw : new Date(raw);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    case 'text':
    default:
      return String(raw);
  }
}

/**
 * Add a formatted sheet to a workbook.
 *
 * @param {ExcelJS.Workbook} workbook
 * @param {string} name - sheet name (Excel caps these at 31 chars and bans []:*?/\)
 * @param {Array} columns - column definitions
 * @param {Array<Object>} rows - plain objects keyed by column key
 * @param {Array<Object>} [footerRows] - appended after a blank spacer, styled bold
 */
function addSheet(workbook, name, columns, rows, footerRows = []) {
  const sheet = workbook.addWorksheet(sanitizeSheetName(name), {
    views: [{ state: 'frozen', ySplit: 1 }], // header row stays visible while scrolling
  });

  sheet.columns = columns.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width || Math.max(12, col.header.length + 4),
  }));

  // Header: bold on a light fill, so it reads as a header after CSV round-trips too
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFEEF2FF' },
  };
  headerRow.alignment = { vertical: 'middle' };

  for (const row of rows) {
    const added = sheet.addRow(
      columns.reduce((acc, col) => {
        acc[col.key] = cellValue(row[col.key], col.type);
        return acc;
      }, {})
    );
    applyRowTypes(added, columns);
  }

  if (footerRows.length > 0) {
    sheet.addRow({}); // spacer
    for (const footer of footerRows) {
      const added = sheet.addRow(
        columns.reduce((acc, col) => {
          acc[col.key] = cellValue(footer[col.key], col.type);
          return acc;
        }, {})
      );
      applyRowTypes(added, columns);
      added.font = { bold: true };
    }
  }

  return sheet;
}

/**
 * Apply per-column number/date/text formatting to one row's cells.
 */
function applyRowTypes(row, columns) {
  columns.forEach((col, index) => {
    const cell = row.getCell(index + 1);
    if (cell.value === null || cell.value === undefined) return;

    switch (col.type) {
      case 'date':
        cell.numFmt = 'dd-mm-yyyy';
        break;
      case 'currency':
        cell.numFmt = '0.00';
        break;
      case 'percent':
        // Stored as a plain number (5 means 5%), not an Excel percentage fraction —
        // ERP importers expect the literal figure off the printed bill.
        cell.numFmt = '0.00';
        break;
      case 'number':
        cell.numFmt = '0.###';
        break;
      case 'text':
      default:
        // The critical one: force text so Excel cannot reinterpret batch numbers
        // like "5P10775" as scientific notation or drop leading zeros.
        cell.numFmt = '@';
        break;
    }
  });
}

/** Excel sheet names: max 31 chars, and []:*?/\ are illegal. */
function sanitizeSheetName(name) {
  const cleaned = String(name || 'Sheet').replace(/[[\]:*?/\\]/g, '-').trim();
  return cleaned.slice(0, 31) || 'Sheet';
}

/**
 * Render a workbook to an xlsx buffer.
 */
async function toXlsxBuffer(workbook) {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/**
 * Render a single sheet's worth of data to CSV, with a UTF-8 BOM so Excel on
 * Windows shows ₹ and Devanagari correctly instead of mojibake.
 */
function toCsvBuffer(columns, rows, footerRows = []) {
  const escape = (value) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    // Quote anything containing a delimiter, quote or newline; double inner quotes
    return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const formatForCsv = (raw, type) => {
    const value = cellValue(raw, type);
    if (value === null) return '';
    if (type === 'date') return formatDDMMYYYY(value);
    return value;
  };

  const lines = [columns.map((c) => escape(c.header)).join(',')];

  for (const row of rows) {
    lines.push(columns.map((c) => escape(formatForCsv(row[c.key], c.type))).join(','));
  }
  if (footerRows.length > 0) {
    lines.push('');
    for (const footer of footerRows) {
      lines.push(columns.map((c) => escape(formatForCsv(footer[c.key], c.type))).join(','));
    }
  }

  return Buffer.from(UTF8_BOM + lines.join('\r\n'), 'utf8');
}

function formatDDMMYYYY(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}

function createWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Setu Pharma';
  workbook.created = new Date();
  return workbook;
}

module.exports = {
  UTF8_BOM,
  createWorkbook,
  addSheet,
  toXlsxBuffer,
  toCsvBuffer,
  formatDDMMYYYY,
  sanitizeSheetName,
  cellValue,
};
