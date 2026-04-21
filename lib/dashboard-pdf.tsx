// SERVER-SIDE ONLY — never import from client components
// PDF exports for the dashboard's Per-Vehicle table and Yearly YTD table.

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
  page:         { fontFamily: 'Helvetica', fontSize: 9, padding: 36, color: '#111827', backgroundColor: '#ffffff' },
  bold:         { fontFamily: 'Helvetica-Bold' },

  headerRow:    { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 18 },
  headerLogo:   { width: 90, marginRight: 14 },
  headerInfo:   { flex: 1 },
  headerName:   { fontFamily: 'Helvetica-Bold', fontSize: 13, marginBottom: 3, color: '#111827' },
  headerSub:    { fontSize: 8, color: '#6B7280', marginBottom: 1 },

  title:        { fontFamily: 'Helvetica-Bold', fontSize: 22, textAlign: 'right', marginBottom: 4, color: '#4F46E5' },
  subtitle:     { fontSize: 10, textAlign: 'right', color: '#6B7280', marginBottom: 18 },

  tableHeader:  { flexDirection: 'row', backgroundColor: '#F9FAFB', padding: '7 10', borderTopWidth: 1, borderTopColor: '#E5E7EB', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  tableRow:     { flexDirection: 'row', padding: '6 10', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  footerRow:    { flexDirection: 'row', padding: '8 10', borderTopWidth: 2, borderTopColor: '#D1D5DB', backgroundColor: '#F9FAFB', marginTop: 2 },
  colHdr:       { fontFamily: 'Helvetica-Bold', fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6B7280' },

  footer:       { position: 'absolute', bottom: 24, left: 36, right: 36, borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 8 },
  footerText:   { fontSize: 7.5, color: '#9CA3AF', marginBottom: 2 },
});

function Header({ subtitle }: { subtitle: string }) {
  return (
    <View style={s.headerRow} fixed>
      {LOGO_SRC && <Image src={LOGO_SRC} style={s.headerLogo} />}
      <View style={s.headerInfo}>
        <Text style={s.headerName}>{SENDER.name}</Text>
        <Text style={s.headerSub}>{SENDER.address}</Text>
        <Text style={s.headerSub}>{SENDER.phone}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={s.title}>P&amp;L</Text>
        <Text style={s.subtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

function Footer() {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>Generated {new Date().toLocaleString('en-CA')}</Text>
      <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Per-Vehicle PDF
// ─────────────────────────────────────────────────────────────

export interface PerVehicleRow {
  cabNumber: string;
  gross:     number;
  driverPay: number;
  gas:       number;
  extra:     number;
  repairs:   number;
  profit:    number;
}

const pv = StyleSheet.create({
  cCab:     { width: 54, fontSize: 9 },
  cCol:     { flex: 1, fontSize: 9, textAlign: 'right' },
  cProfit:  { flex: 1, fontSize: 9, textAlign: 'right', fontFamily: 'Helvetica-Bold' },
});

export async function renderPerVehiclePDF(params: {
  month: number;
  year:  number;
  rows:  PerVehicleRow[];
}): Promise<Buffer> {
  const monthName = MONTHS[params.month - 1];
  const totals = params.rows.reduce(
    (a, r) => ({
      gross:     a.gross     + r.gross,
      driverPay: a.driverPay + r.driverPay,
      gas:       a.gas       + r.gas,
      extra:     a.extra     + r.extra,
      repairs:   a.repairs   + r.repairs,
      profit:    a.profit    + r.profit,
    }),
    { gross: 0, driverPay: 0, gas: 0, extra: 0, repairs: 0, profit: 0 },
  );

  const doc = (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Header subtitle={`Per-Vehicle Profit — ${monthName} ${params.year}`} />

        <View style={s.tableHeader}>
          <Text style={[s.colHdr, pv.cCab]}>Cab #</Text>
          <Text style={[s.colHdr, pv.cCol]}>Gross</Text>
          <Text style={[s.colHdr, pv.cCol]}>Driver 40%</Text>
          <Text style={[s.colHdr, pv.cCol]}>Gas</Text>
          <Text style={[s.colHdr, pv.cCol]}>Extra</Text>
          <Text style={[s.colHdr, pv.cCol]}>Repairs</Text>
          <Text style={[s.colHdr, pv.cProfit]}>Profit</Text>
        </View>

        {params.rows.length === 0 ? (
          <View style={[s.tableRow, { justifyContent: 'center' }]}>
            <Text style={{ fontSize: 9, color: '#9CA3AF', fontStyle: 'italic' }}>No company cabs for this month.</Text>
          </View>
        ) : (
          params.rows.map((r) => (
            <View key={r.cabNumber} style={s.tableRow}>
              <Text style={[pv.cCab, s.bold]}>#{r.cabNumber}</Text>
              <Text style={pv.cCol}>{formatCurrency(r.gross)}</Text>
              <Text style={[pv.cCol, { color: '#6B7280' }]}>-{formatCurrency(r.driverPay)}</Text>
              <Text style={[pv.cCol, { color: '#6B7280' }]}>-{formatCurrency(r.gas)}</Text>
              <Text style={[pv.cCol, { color: '#6B7280' }]}>-{formatCurrency(r.extra)}</Text>
              <Text style={[pv.cCol, { color: '#6B7280' }]}>{r.repairs > 0 ? `-${formatCurrency(r.repairs)}` : '—'}</Text>
              <Text style={[pv.cProfit, { color: r.profit >= 0 ? '#059669' : '#DC2626' }]}>{formatCurrency(r.profit)}</Text>
            </View>
          ))
        )}

        <View style={s.footerRow}>
          <Text style={[pv.cCab, s.bold]}>Totals</Text>
          <Text style={[pv.cCol, s.bold]}>{formatCurrency(totals.gross)}</Text>
          <Text style={[pv.cCol, s.bold, { color: '#6B7280' }]}>-{formatCurrency(totals.driverPay)}</Text>
          <Text style={[pv.cCol, s.bold, { color: '#6B7280' }]}>-{formatCurrency(totals.gas)}</Text>
          <Text style={[pv.cCol, s.bold, { color: '#6B7280' }]}>-{formatCurrency(totals.extra)}</Text>
          <Text style={[pv.cCol, s.bold, { color: '#6B7280' }]}>{totals.repairs > 0 ? `-${formatCurrency(totals.repairs)}` : '—'}</Text>
          <Text style={[pv.cProfit, { color: totals.profit >= 0 ? '#059669' : '#DC2626' }]}>{formatCurrency(totals.profit)}</Text>
        </View>

        <Footer />
      </Page>
    </Document>
  );

  return await renderToBuffer(doc);
}

// ─────────────────────────────────────────────────────────────
// Yearly YTD PDF
// ─────────────────────────────────────────────────────────────

export interface YearlyRow {
  month:           number;
  revenue:         number;
  carExpenses:     number;
  companyExpenses: number;
  profit:          number;
}

const yr = StyleSheet.create({
  cMonth:  { width: 80, fontSize: 9 },
  cCol:    { flex: 1, fontSize: 9, textAlign: 'right' },
  cProfit: { flex: 1, fontSize: 9, textAlign: 'right', fontFamily: 'Helvetica-Bold' },
});

export async function renderYearlyPDF(params: {
  year:      number;
  curMonth:  number;
  rows:      YearlyRow[];
}): Promise<Buffer> {
  const totals = params.rows.reduce(
    (a, r) => ({
      revenue:         a.revenue         + r.revenue,
      carExpenses:     a.carExpenses     + r.carExpenses,
      companyExpenses: a.companyExpenses + r.companyExpenses,
      profit:          a.profit          + r.profit,
    }),
    { revenue: 0, carExpenses: 0, companyExpenses: 0, profit: 0 },
  );

  const doc = (
    <Document>
      <Page size="A4" style={s.page}>
        <Header subtitle={`${params.year} — Year to Date`} />

        <View style={s.tableHeader}>
          <Text style={[s.colHdr, yr.cMonth]}>Month</Text>
          <Text style={[s.colHdr, yr.cCol]}>Revenue</Text>
          <Text style={[s.colHdr, yr.cCol]}>Car Expenses</Text>
          <Text style={[s.colHdr, yr.cCol]}>Other Expense</Text>
          <Text style={[s.colHdr, yr.cProfit]}>Total Profit</Text>
        </View>

        {params.rows.map((r) => {
          const isFuture = r.month > params.curMonth;
          const color    = isFuture ? '#9CA3AF' : '#111827';
          return (
            <View key={r.month} style={s.tableRow}>
              <Text style={[yr.cMonth, s.bold, { color }]}>{MONTHS[r.month - 1]}{r.month === params.curMonth ? '  (current)' : ''}</Text>
              <Text style={[yr.cCol, { color }]}>{formatCurrency(r.revenue)}</Text>
              <Text style={[yr.cCol, { color: isFuture ? '#9CA3AF' : '#6B7280' }]}>-{formatCurrency(r.carExpenses)}</Text>
              <Text style={[yr.cCol, { color: isFuture ? '#9CA3AF' : '#6B7280' }]}>-{formatCurrency(r.companyExpenses)}</Text>
              <Text style={[yr.cProfit, { color: isFuture ? '#9CA3AF' : r.profit >= 0 ? '#059669' : '#DC2626' }]}>{formatCurrency(r.profit)}</Text>
            </View>
          );
        })}

        <View style={s.footerRow}>
          <Text style={[yr.cMonth, s.bold]}>YTD Total</Text>
          <Text style={[yr.cCol, s.bold]}>{formatCurrency(totals.revenue)}</Text>
          <Text style={[yr.cCol, s.bold, { color: '#6B7280' }]}>-{formatCurrency(totals.carExpenses)}</Text>
          <Text style={[yr.cCol, s.bold, { color: '#6B7280' }]}>-{formatCurrency(totals.companyExpenses)}</Text>
          <Text style={[yr.cProfit, { color: totals.profit >= 0 ? '#059669' : '#DC2626' }]}>{formatCurrency(totals.profit)}</Text>
        </View>

        <Footer />
      </Page>
    </Document>
  );

  return await renderToBuffer(doc);
}
