// SERVER-SIDE ONLY — never import from client components
// Filtered daily-sheet master list export. Mirrors the on-screen
// table so the office can print exactly what they see.

import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import * as fs from 'fs';
import * as path from 'path';
import { formatCurrency } from './tax';
import { SENDER, MONTHS } from './constants';

function loadLogoBase64(): string | null {
  try {
    const logoPath = path.join(process.cwd(), 'public', 'logo.png');
    const buf = fs.readFileSync(logoPath);
    const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8;
    const mime   = isJpeg ? 'image/jpeg' : 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch { return null; }
}
const LOGO_SRC = loadLogoBase64();

const s = StyleSheet.create({
  page:         { fontFamily: 'Helvetica', fontSize: 8, padding: 28, color: '#111827', backgroundColor: '#ffffff' },
  bold:         { fontFamily: 'Helvetica-Bold' },

  headerRow:    { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  headerLogo:   { width: 70, marginRight: 12 },
  headerInfo:   { flex: 1 },
  headerName:   { fontFamily: 'Helvetica-Bold', fontSize: 12, marginBottom: 2, color: '#111827' },
  headerSub:    { fontSize: 7.5, color: '#6B7280', marginBottom: 1 },

  title:        { fontFamily: 'Helvetica-Bold', fontSize: 20, textAlign: 'right', marginBottom: 2, color: '#4F46E5' },
  subtitle:     { fontSize: 9, textAlign: 'right', color: '#6B7280' },

  filters:      { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#F9FAFB', borderRadius: 4, padding: 8, marginBottom: 10, gap: 12 },
  filterItem:   { flexDirection: 'row', gap: 4 },
  filterLbl:    { fontSize: 7.5, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.3 },
  filterVal:    { fontSize: 8, color: '#111827', fontFamily: 'Helvetica-Bold' },

  tableHeader:  { flexDirection: 'row', backgroundColor: '#F3F4F6', padding: '5 4', borderTopWidth: 1, borderTopColor: '#E5E7EB', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  tableRow:     { flexDirection: 'row', padding: '4 4', borderBottomWidth: 0.5, borderBottomColor: '#F3F4F6' },
  zebraRow:     { backgroundColor: '#FAFAFA' },
  colHdr:       { fontFamily: 'Helvetica-Bold', fontSize: 7, textTransform: 'uppercase', letterSpacing: 0.2, color: '#6B7280' },

  cDate:     { width: 52, fontSize: 7.5 },
  cDriver:   { width: 75, fontSize: 7.5 },
  cCab:      { width: 34, fontSize: 7.5, textAlign: 'center' },
  cShift:    { width: 34, fontSize: 7.5 },
  cNum:      { flex: 1,   fontSize: 7.5, textAlign: 'right' },
  cPay:      { flex: 1,   fontSize: 7.5, textAlign: 'right', fontFamily: 'Helvetica-Bold' },
  cPaid:     { width: 34, fontSize: 7.5, textAlign: 'center' },

  totalRow:     { flexDirection: 'row', padding: '6 4', backgroundColor: '#EEF2FF', borderTopWidth: 1, borderTopColor: '#C7D2FE' },
  totalLbl:     { fontFamily: 'Helvetica-Bold', fontSize: 8, color: '#3730A3' },
  totalVal:     { fontFamily: 'Helvetica-Bold', fontSize: 8, color: '#3730A3', textAlign: 'right' },

  summaryBand:  { marginTop: 14, flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#4F46E5', borderRadius: 6, padding: '10 14' },
  summaryBlk:   { alignItems: 'flex-start' },
  summaryLbl:   { fontSize: 7.5, color: '#C7D2FE', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  summaryVal:   { fontFamily: 'Helvetica-Bold', fontSize: 12, color: '#ffffff' },

  emptyBox:     { marginTop: 40, alignItems: 'center' },
  emptyText:    { fontSize: 10, color: '#9CA3AF', fontStyle: 'italic' },

  footer:       { position: 'absolute', bottom: 18, left: 28, right: 28, borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 6, flexDirection: 'row', justifyContent: 'space-between' },
  footerText:   { fontSize: 7, color: '#9CA3AF' },
});

export interface DailySheetRow {
  date: string;              // ISO
  shift: 'MORNING' | 'EVENING';
  driverName: string;
  vehicleNumber: string;
  grossEarnings: number;
  debitFee: number;
  debitTransactionCount: number;
  gasDeduction: number;
  callChargeDeduction: number;
  extraExpenseDeduction: number;
  companyNet: number;        // shown as "Driver Pay" in the UI
  isPaid: boolean;
}

export interface DailySheetsPDFFilters {
  driverName?:    string;    // "All Drivers" if blank
  vehicleNumber?: string;    // "All Vehicles" if blank
  month:          number;    // 1-12
  year:           number;
  shift?:         'MORNING' | 'EVENING' | '';
  isPaid?:        'true' | 'false' | '';
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
}

function DailySheetsDoc({ rows, filters }: { rows: DailySheetRow[]; filters: DailySheetsPDFFilters }) {
  const generated = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });

  const totals = rows.reduce((a, r) => ({
    gross:    a.gross    + r.grossEarnings,
    debit:    a.debit    + r.debitFee,
    debitTxn: a.debitTxn + r.debitTransactionCount,
    gas:      a.gas      + r.gasDeduction,
    call:     a.call     + r.callChargeDeduction,
    extra:    a.extra    + r.extraExpenseDeduction,
    net:      a.net      + r.companyNet,
  }), { gross: 0, debit: 0, debitTxn: 0, gas: 0, call: 0, extra: 0, net: 0 });

  const expenses = totals.gas + totals.call + totals.extra;

  return (
    <Document>
      <Page size="LETTER" orientation="landscape" style={s.page}>
        {/* Header */}
        <View style={s.headerRow}>
          {LOGO_SRC && <Image src={LOGO_SRC} style={s.headerLogo} />}
          <View style={s.headerInfo}>
            <Text style={s.headerName}>{SENDER.name}</Text>
            <Text style={s.headerSub}>{SENDER.address}</Text>
            <Text style={s.headerSub}>{SENDER.city}</Text>
            <Text style={s.headerSub}>{SENDER.phone}</Text>
            <Text style={s.headerSub}>{SENDER.email}</Text>
          </View>
          <View>
            <Text style={s.title}>DAILY SHEETS</Text>
            <Text style={s.subtitle}>{MONTHS[filters.month - 1]} {filters.year}</Text>
          </View>
        </View>

        {/* Active filters strip */}
        <View style={s.filters}>
          <View style={s.filterItem}>
            <Text style={s.filterLbl}>Driver:</Text>
            <Text style={s.filterVal}>{filters.driverName || 'All Drivers'}</Text>
          </View>
          <View style={s.filterItem}>
            <Text style={s.filterLbl}>Vehicle:</Text>
            <Text style={s.filterVal}>{filters.vehicleNumber ? `#${filters.vehicleNumber}` : 'All Vehicles'}</Text>
          </View>
          <View style={s.filterItem}>
            <Text style={s.filterLbl}>Shift:</Text>
            <Text style={s.filterVal}>{filters.shift === 'MORNING' ? 'Morning' : filters.shift === 'EVENING' ? 'Evening' : 'All Shifts'}</Text>
          </View>
          <View style={s.filterItem}>
            <Text style={s.filterLbl}>Paid:</Text>
            <Text style={s.filterVal}>{filters.isPaid === 'true' ? 'Paid' : filters.isPaid === 'false' ? 'Unpaid' : 'All'}</Text>
          </View>
          <View style={[s.filterItem, { marginLeft: 'auto' }]}>
            <Text style={s.filterLbl}>Generated:</Text>
            <Text style={s.filterVal}>{generated}</Text>
          </View>
        </View>

        {rows.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyText}>No daily sheets match these filters.</Text>
          </View>
        ) : (
          <>
            {/* Table header */}
            <View style={s.tableHeader} fixed>
              <Text style={[s.colHdr, s.cDate]}>Date</Text>
              <Text style={[s.colHdr, s.cDriver]}>Driver</Text>
              <Text style={[s.colHdr, s.cCab]}>Cab</Text>
              <Text style={[s.colHdr, s.cShift]}>Shift</Text>
              <Text style={[s.colHdr, s.cNum]}>Gross</Text>
              <Text style={[s.colHdr, s.cNum]}>Debit ($)</Text>
              <Text style={[s.colHdr, s.cNum]}>Debit Txn</Text>
              <Text style={[s.colHdr, s.cNum]}>Gas ($)</Text>
              <Text style={[s.colHdr, s.cNum]}>Call ($)</Text>
              <Text style={[s.colHdr, s.cNum]}>Extra ($)</Text>
              <Text style={[s.colHdr, s.cNum]}>Driver Pay</Text>
              <Text style={[s.colHdr, s.cPaid]}>Paid</Text>
            </View>

            {rows.map((r, i) => (
              <View key={i} style={[s.tableRow, i % 2 === 1 ? s.zebraRow : {}]} wrap={false}>
                <Text style={s.cDate}>{fmtDate(r.date)}</Text>
                <Text style={s.cDriver}>{r.driverName}</Text>
                <Text style={s.cCab}>#{r.vehicleNumber}</Text>
                <Text style={s.cShift}>{r.shift === 'MORNING' ? 'AM' : 'PM'}</Text>
                <Text style={s.cNum}>{formatCurrency(r.grossEarnings)}</Text>
                <Text style={s.cNum}>{formatCurrency(r.debitFee)}</Text>
                <Text style={s.cNum}>{r.debitTransactionCount}</Text>
                <Text style={s.cNum}>{formatCurrency(r.gasDeduction)}</Text>
                <Text style={s.cNum}>{formatCurrency(r.callChargeDeduction)}</Text>
                <Text style={s.cNum}>{formatCurrency(r.extraExpenseDeduction)}</Text>
                <Text style={[s.cPay, { color: r.companyNet < 0 ? '#DC2626' : '#047857' }]}>
                  {formatCurrency(r.companyNet)}
                </Text>
                <Text style={[s.cPaid, { color: r.isPaid ? '#047857' : '#B45309' }]}>
                  {r.isPaid ? 'Paid' : 'Unpaid'}
                </Text>
              </View>
            ))}

            {/* Totals row */}
            <View style={s.totalRow}>
              <Text style={[s.totalLbl, s.cDate]}>Totals</Text>
              <Text style={[s.totalLbl, s.cDriver]}>({rows.length} sheet{rows.length !== 1 ? 's' : ''})</Text>
              <Text style={s.cCab} />
              <Text style={s.cShift} />
              <Text style={[s.totalVal, s.cNum]}>{formatCurrency(totals.gross)}</Text>
              <Text style={[s.totalVal, s.cNum]}>{formatCurrency(totals.debit)}</Text>
              <Text style={[s.totalVal, s.cNum]}>{totals.debitTxn}</Text>
              <Text style={[s.totalVal, s.cNum]}>{formatCurrency(totals.gas)}</Text>
              <Text style={[s.totalVal, s.cNum]}>{formatCurrency(totals.call)}</Text>
              <Text style={[s.totalVal, s.cNum]}>{formatCurrency(totals.extra)}</Text>
              <Text style={[s.totalVal, s.cNum, { color: totals.net < 0 ? '#DC2626' : '#3730A3' }]}>
                {formatCurrency(totals.net)}
              </Text>
              <Text style={s.cPaid} />
            </View>

            {/* Summary band */}
            <View style={s.summaryBand}>
              <View style={s.summaryBlk}>
                <Text style={s.summaryLbl}>Revenue (Gross)</Text>
                <Text style={s.summaryVal}>{formatCurrency(totals.gross)}</Text>
              </View>
              <View style={s.summaryBlk}>
                <Text style={s.summaryLbl}>Car Expenses</Text>
                <Text style={s.summaryVal}>{formatCurrency(expenses)}</Text>
              </View>
              <View style={s.summaryBlk}>
                <Text style={s.summaryLbl}>Debit Fees</Text>
                <Text style={s.summaryVal}>{formatCurrency(Math.max(totals.debit - totals.debitTxn, 0))}</Text>
              </View>
              <View style={s.summaryBlk}>
                <Text style={s.summaryLbl}>Driver Pay / Co. Net</Text>
                <Text style={[s.summaryVal, { color: totals.net < 0 ? '#FCA5A5' : '#ffffff' }]}>{formatCurrency(totals.net)}</Text>
              </View>
            </View>
          </>
        )}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>{SENDER.name} · {SENDER.phone}</Text>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

export async function renderDailySheetsPDF(
  rows: DailySheetRow[],
  filters: DailySheetsPDFFilters,
): Promise<Buffer> {
  return renderToBuffer(<DailySheetsDoc rows={rows} filters={filters} />) as Promise<Buffer>;
}
