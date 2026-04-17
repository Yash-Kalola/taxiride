// SERVER-SIDE ONLY — never import from client components
// Monthly driver report: all shifts in a given month, grouped by
// 10-day payout period, with per-period and monthly totals.

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
  page:          { fontFamily: 'Helvetica', fontSize: 9, padding: 36, color: '#111827', backgroundColor: '#ffffff' },
  bold:          { fontFamily: 'Helvetica-Bold' },

  headerRow:     { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 18 },
  headerLogo:    { width: 90, marginRight: 14 },
  headerInfo:    { flex: 1 },
  headerName:    { fontFamily: 'Helvetica-Bold', fontSize: 13, marginBottom: 3, color: '#111827' },
  headerSub:     { fontSize: 8, color: '#6B7280', marginBottom: 1 },

  title:         { fontFamily: 'Helvetica-Bold', fontSize: 22, textAlign: 'right', marginBottom: 4, color: '#4F46E5' },
  subtitle:      { fontSize: 10, textAlign: 'right', color: '#6B7280', marginBottom: 18 },

  divider:       { borderBottomWidth: 1, borderBottomColor: '#E5E7EB', marginBottom: 10 },

  driverBox:     { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 6, padding: '10 14', marginBottom: 14, backgroundColor: '#F9FAFB' },
  driverName:    { fontFamily: 'Helvetica-Bold', fontSize: 14, color: '#111827' },
  driverMeta:    { fontSize: 9, color: '#6B7280', marginTop: 2 },

  periodHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, marginBottom: 4, paddingHorizontal: 2 },
  periodLabel:   { fontFamily: 'Helvetica-Bold', fontSize: 10, color: '#3730A3' },
  periodMeta:    { fontSize: 8, color: '#6B7280' },

  tableHeader:   { flexDirection: 'row', backgroundColor: '#F9FAFB', padding: '5 8', borderTopWidth: 1, borderTopColor: '#E5E7EB', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  tableRow:      { flexDirection: 'row', padding: '4 8', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  colHdr:        { fontFamily: 'Helvetica-Bold', fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 0.3, color: '#6B7280' },

  cDate:     { width: 60, fontSize: 8 },
  cShift:    { width: 44, fontSize: 8 },
  cVehicle:  { width: 44, fontSize: 8, textAlign: 'center' },
  cStatus:   { width: 54, fontSize: 8 },
  cDriver:   { flex: 1,   fontSize: 8, textAlign: 'right', fontFamily: 'Helvetica-Bold' },

  subtotalRow:   { flexDirection: 'row', padding: '5 8', backgroundColor: '#EEF2FF', borderBottomWidth: 1, borderBottomColor: '#C7D2FE' },
  subtotalLbl:   { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: '#3730A3' },
  subtotalVal:   { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: '#3730A3', textAlign: 'right' },

  emptyRow:      { flexDirection: 'row', justifyContent: 'center', padding: '8 8' },
  emptyText:     { fontSize: 8, color: '#9CA3AF', fontStyle: 'italic' },

  grandBox:      { marginTop: 20, alignItems: 'flex-end' },
  grandInner:    { width: 320 },
  grandRow:      { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#4F46E5', borderRadius: 6, padding: '12 16' },
  grandLbl:      { fontFamily: 'Helvetica-Bold', color: '#ffffff', fontSize: 12 },
  grandVal:      { fontFamily: 'Helvetica-Bold', color: '#ffffff', textAlign: 'right', fontSize: 12 },
  grandNote:     { fontSize: 7.5, color: '#6B7280', fontStyle: 'italic', textAlign: 'right', marginTop: 6, paddingRight: 4 },

  footer:        { position: 'absolute', bottom: 24, left: 36, right: 36, borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 8 },
  footerText:    { fontSize: 7.5, color: '#9CA3AF', marginBottom: 2 },
});

export interface DriverReportSheet {
  date: string;              // ISO
  shift: 'MORNING' | 'EVENING';
  vehicleNumber: string;
  payoutPeriod: number;      // 1, 2, or 3
  driverPay: number;         // companyNet per sheet
  isPaid: boolean;
}

export interface DriverReportData {
  driverName:    string;
  driverPhone?:  string;
  licenseNumber?: string;
  month:         number;     // 1-12
  year:          number;
  sheets:        DriverReportSheet[];
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function PeriodSection({ periodNum, periodSheets, periodLabel }: {
  periodNum: 1 | 2 | 3;
  periodSheets: DriverReportSheet[];
  periodLabel: string;
}) {
  const subtotal = periodSheets.reduce((s, x) => s + x.driverPay, 0);

  return (
    <View wrap={false}>
      <View style={s.periodHeader}>
        <Text style={s.periodLabel}>Period {periodNum} — {periodLabel}</Text>
        <Text style={s.periodMeta}>{periodSheets.length} shift{periodSheets.length !== 1 ? 's' : ''}</Text>
      </View>

      <View style={s.tableHeader}>
        <Text style={[s.colHdr, s.cDate]}>Date</Text>
        <Text style={[s.colHdr, s.cShift]}>Shift</Text>
        <Text style={[s.colHdr, s.cVehicle]}>Cab</Text>
        <Text style={[s.colHdr, s.cStatus]}>Status</Text>
        <Text style={[s.colHdr, s.cDriver]}>Driver Pay</Text>
      </View>

      {periodSheets.length === 0 ? (
        <View style={s.emptyRow}>
          <Text style={s.emptyText}>No shifts in this period</Text>
        </View>
      ) : periodSheets.map((row, i) => (
        <View key={i} style={s.tableRow}>
          <Text style={s.cDate}>{fmtDate(row.date)}</Text>
          <Text style={s.cShift}>{row.shift === 'MORNING' ? 'AM' : 'PM'}</Text>
          <Text style={s.cVehicle}>#{row.vehicleNumber}</Text>
          <Text style={[s.cStatus, { color: row.isPaid ? '#047857' : '#B45309' }]}>
            {row.isPaid ? 'Paid' : 'Unpaid'}
          </Text>
          <Text style={[s.cDriver, { color: row.driverPay < 0 ? '#DC2626' : '#047857' }]}>
            {formatCurrency(row.driverPay)}
          </Text>
        </View>
      ))}

      {periodSheets.length > 0 && (
        <View style={s.subtotalRow}>
          <Text style={[s.subtotalLbl, s.cDate]}>Subtotal</Text>
          <Text style={s.cShift} />
          <Text style={s.cVehicle} />
          <Text style={s.cStatus} />
          <Text style={[s.subtotalVal, s.cDriver, { color: subtotal < 0 ? '#DC2626' : '#3730A3' }]}>
            {formatCurrency(subtotal)}
          </Text>
        </View>
      )}
    </View>
  );
}

function PeriodRangeLabel(period: 1 | 2 | 3, month: number, year: number): string {
  const m = month - 1;
  if (period === 1) return `${MONTHS[m].slice(0, 3)} 1–10, ${year}`;
  if (period === 2) return `${MONTHS[m].slice(0, 3)} 11–20, ${year}`;
  const last = new Date(year, month, 0).getDate();
  return `${MONTHS[m].slice(0, 3)} 21–${last}, ${year}`;
}

function DriverReportDoc({ data }: { data: DriverReportData }) {
  const monthName = MONTHS[data.month - 1];
  const generated = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
  const monthTotal = data.sheets.reduce((s, x) => s + x.driverPay, 0);

  // Group sheets by period
  const p1 = data.sheets.filter((s) => s.payoutPeriod === 1).sort((a, b) => a.date.localeCompare(b.date));
  const p2 = data.sheets.filter((s) => s.payoutPeriod === 2).sort((a, b) => a.date.localeCompare(b.date));
  const p3 = data.sheets.filter((s) => s.payoutPeriod === 3).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <Document>
      <Page size="LETTER" style={s.page}>
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
            <Text style={s.title}>DRIVER REPORT</Text>
            <Text style={s.subtitle}>{monthName} {data.year}</Text>
          </View>
        </View>

        {/* Driver info */}
        <View style={s.driverBox}>
          <Text style={s.driverName}>{data.driverName}</Text>
          <Text style={s.driverMeta}>
            {data.driverPhone && `Phone: ${data.driverPhone}`}
            {data.driverPhone && data.licenseNumber && '  ·  '}
            {data.licenseNumber && `License: ${data.licenseNumber}`}
            {(data.driverPhone || data.licenseNumber) && '  ·  '}
            {data.sheets.length} shift{data.sheets.length !== 1 ? 's' : ''}
            {'  ·  '}Generated {generated}
          </Text>
        </View>

        <View style={s.divider} />

        {/* Three period sections */}
        <PeriodSection periodNum={1} periodSheets={p1} periodLabel={PeriodRangeLabel(1, data.month, data.year)} />
        <PeriodSection periodNum={2} periodSheets={p2} periodLabel={PeriodRangeLabel(2, data.month, data.year)} />
        <PeriodSection periodNum={3} periodSheets={p3} periodLabel={PeriodRangeLabel(3, data.month, data.year)} />

        {/* Monthly grand total */}
        <View style={s.grandBox}>
          <View style={s.grandInner}>
            <View style={s.grandRow}>
              <Text style={s.grandLbl}>Month Total — {monthName}</Text>
              <Text style={[s.grandVal, { color: monthTotal < 0 ? '#FCA5A5' : '#ffffff' }]}>
                {formatCurrency(monthTotal)}
              </Text>
            </View>
            <Text style={s.grandNote}>
              Negative = company pays driver; positive = driver pays company.
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>{SENDER.name} · {SENDER.address}, {SENDER.city}</Text>
          <Text style={s.footerText}>{SENDER.phone} · {SENDER.email}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderDriverReportPDF(data: DriverReportData): Promise<Buffer> {
  return renderToBuffer(<DriverReportDoc data={data} />) as Promise<Buffer>;
}
