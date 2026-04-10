import { google } from 'googleapis';
import type { Company, Invoice, Ride } from './types';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Column index constants
const COMPANY_COL = { ACCOUNT_ID: 0, COMPANY_NAME: 1, ADDRESS: 2, PO: 3, EXPECTED: 4, EMAIL: 5 } as const;
const RIDE_COL = { ACCOUNT_ID: 0, VEHICLE: 2, JOB_ID: 3, PICKUP: 4, DROPOFF: 5, PASSENGER: 6, DRIVER: 7, DATETIME: 8, AMOUNT: 9 } as const;
const INVOICE_COL = { NUMBER: 0, COMPANY: 1, ACCOUNT: 2, MONTH: 3, YEAR: 4, BASE: 5, HST: 6, TOTAL: 7, DATE_SENT: 8, DUE: 9, STATUS: 10, VERIFIED: 11, FLAGGED: 12 } as const;

function getAuth() {
  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: SCOPES,
  });
}

function getSheets() {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

function getSheetIdForYear(year: number): string {
  const ids = JSON.parse(process.env.GOOGLE_SHEET_IDS || '{}') as Record<string, string>;
  const id = ids[String(year)];
  if (!id) throw new Error(`No spreadsheet configured for year ${year}. Add it to GOOGLE_SHEET_IDS.`);
  return id;
}

function getMasterSheetId(): string {
  const id = process.env.GOOGLE_MASTER_SHEET_ID;
  if (!id) throw new Error('GOOGLE_MASTER_SHEET_ID is not set.');
  return id;
}

/** Resolves a month name to the actual tab title in the spreadsheet (handles "January" and "Jan"). */
export async function resolveMonthTab(month: string, year: number): Promise<string> {
  const sheets = getSheets();
  const spreadsheetId = getSheetIdForYear(year);
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title',
  });
  const titles = (res.data.sheets ?? []).map((s) => s.properties?.title ?? '');
  const lower = month.toLowerCase();
  const match = titles.find(
    (t) => t.toLowerCase() === lower || t.toLowerCase() === lower.slice(0, 3)
  );
  if (!match) throw new Error(`No tab found for month "${month}" in ${year} spreadsheet.`);
  return match;
}

export async function getCompanies(): Promise<Company[]> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getMasterSheetId(),
    range: 'Companies!A2:F',
  });
  const rows = res.data.values ?? [];
  return rows
    .filter((row) => row[COMPANY_COL.ACCOUNT_ID])
    .map((row) => ({
      accountId: row[COMPANY_COL.ACCOUNT_ID] ?? '',
      companyName: row[COMPANY_COL.COMPANY_NAME] ?? '',
      address: row[COMPANY_COL.ADDRESS] ?? '',
      poNumber: row[COMPANY_COL.PO] ?? '',
      expectedMonthlyRides: parseInt(row[COMPANY_COL.EXPECTED] ?? '0', 10) || 0,
      email: row[COMPANY_COL.EMAIL] ?? '',
    }));
}

export async function getRides(month: string, year: number, accountId: string): Promise<Ride[]> {
  const sheets = getSheets();
  const tabName = await resolveMonthTab(month, year);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetIdForYear(year),
    range: `'${tabName}'!A2:J`,
  });
  const rows = res.data.values ?? [];
  return rows
    .filter((row) => row[RIDE_COL.ACCOUNT_ID] === accountId)
    .map((row) => ({
      jobId: row[RIDE_COL.JOB_ID] ?? '',
      vehicleNumber: row[RIDE_COL.VEHICLE] ?? '',
      pickupLocation: row[RIDE_COL.PICKUP] ?? '',
      dropoffLocation: row[RIDE_COL.DROPOFF] ?? '',
      passenger: row[RIDE_COL.PASSENGER] ?? '',
      driver: row[RIDE_COL.DRIVER] ?? '',
      dateTime: row[RIDE_COL.DATETIME] ?? '',
      amount: parseFloat(row[RIDE_COL.AMOUNT] ?? '0') || 0,
    }));
}

export async function getNextInvoiceNumber(): Promise<number> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getMasterSheetId(),
    range: 'Invoices!A:A',
  });
  const rows = res.data.values ?? [];
  const numbers = rows
    .slice(1) // skip header
    .map((row) => parseInt(row[0], 10))
    .filter((n) => !isNaN(n));
  if (numbers.length === 0) {
    return parseInt(process.env.INVOICE_NUMBER_SEED ?? '1593', 10);
  }
  return Math.max(...numbers) + 1;
}

export async function getInvoices(filters?: {
  year?: number;
  month?: string;
  accountId?: string;
  status?: string;
}): Promise<Invoice[]> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getMasterSheetId(),
    range: 'Invoices!A2:M',
  });
  const rows = res.data.values ?? [];
  let invoices: Invoice[] = rows
    .filter((row) => row[INVOICE_COL.NUMBER])
    .map((row, i) => ({
      invoiceNumber: parseInt(row[INVOICE_COL.NUMBER], 10),
      companyName: row[INVOICE_COL.COMPANY] ?? '',
      accountId: row[INVOICE_COL.ACCOUNT] ?? '',
      month: row[INVOICE_COL.MONTH] ?? '',
      year: parseInt(row[INVOICE_COL.YEAR], 10),
      amountPreTax: parseFloat(row[INVOICE_COL.BASE] ?? '0') || 0,
      hst: parseFloat(row[INVOICE_COL.HST] ?? '0') || 0,
      total: parseFloat(row[INVOICE_COL.TOTAL] ?? '0') || 0,
      dateSent: row[INVOICE_COL.DATE_SENT] ?? '',
      dueDate: row[INVOICE_COL.DUE] ?? '',
      status: (row[INVOICE_COL.STATUS] === 'Paid' ? 'Paid' : 'Pending') as 'Paid' | 'Pending',
      verified: row[INVOICE_COL.VERIFIED]?.toUpperCase() === 'TRUE',
      flagged: row[INVOICE_COL.FLAGGED]?.toUpperCase() === 'TRUE',
      rowIndex: i + 2, // 1-based, offset by header row
    }));

  if (filters?.year) invoices = invoices.filter((inv) => inv.year === filters.year);
  if (filters?.month) invoices = invoices.filter((inv) => inv.month.toLowerCase() === filters.month!.toLowerCase());
  if (filters?.accountId) invoices = invoices.filter((inv) => inv.accountId === filters.accountId);
  if (filters?.status && filters.status !== 'All') invoices = invoices.filter((inv) => inv.status === filters.status);

  return invoices;
}

export async function appendInvoiceRow(invoice: Invoice): Promise<number> {
  const sheets = getSheets();
  const row = [
    invoice.invoiceNumber,
    invoice.companyName,
    invoice.accountId,
    invoice.month,
    invoice.year,
    invoice.amountPreTax,
    invoice.hst,
    invoice.total,
    invoice.dateSent,
    invoice.dueDate,
    invoice.status,
    invoice.verified ? 'TRUE' : 'FALSE',
    invoice.flagged ? 'TRUE' : 'FALSE',
  ];
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId: getMasterSheetId(),
    range: 'Invoices!A:M',
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });
  // Parse row index from updatedRange e.g. "Invoices!A47:M47" → 47
  const updatedRange = res.data.updates?.updatedRange ?? '';
  const match = updatedRange.match(/:M(\d+)/);
  return match ? parseInt(match[1], 10) : -1;
}

export async function updateInvoiceRow(rowIndex: number, invoice: Invoice): Promise<void> {
  const sheets = getSheets();
  const row = [
    invoice.invoiceNumber,
    invoice.companyName,
    invoice.accountId,
    invoice.month,
    invoice.year,
    invoice.amountPreTax,
    invoice.hst,
    invoice.total,
    invoice.dateSent,
    invoice.dueDate,
    invoice.status,
    invoice.verified ? 'TRUE' : 'FALSE',
    invoice.flagged ? 'TRUE' : 'FALSE',
  ];
  await sheets.spreadsheets.values.update({
    spreadsheetId: getMasterSheetId(),
    range: `Invoices!A${rowIndex}:M${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });
}
