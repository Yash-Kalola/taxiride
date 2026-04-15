// SERVER-SIDE ONLY — never import from client components
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import * as fs from 'fs';
import * as path from 'path';
import { formatCurrency } from './tax';
import { SENDER, MONTHS } from './constants';
import { formatPeriodLabel } from './driver-pay';

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

  // Driver section
  driverHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 12, marginBottom: 6 },
  driverName:    { fontFamily: 'Helvetica-Bold', fontSize: 12, color: '#111827' },
  driverMeta:    { fontSize: 8, color: '#6B7280' },

  // Table
  tableHeader:   { flexDirection: 'row', backgroundColor: '#F9FAFB', padding: '5 8', borderTopWidth: 1, borderTopColor: '#E5E7EB', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  tableRow:      { flexDirection: 'row', padding: '4 8', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  colHdr:        { fontFamily: 'Helvetica-Bold', fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 0.3, color: '#6B7280' },

  cDate:    { width: 52, fontSize: 8 },
  cShift:   { width: 42, fontSize: 8 },
  cVehicle: { width: 38, fontSize: 8, textAlign: 'center' },
  cGross:   { width: 58, fontSize: 8, textAlign: 'right' },
  cGas:     { width: 46, fontSize: 8, textAlign: 'right', color: '#6B7280' },
  cDebit:   { width: 46, fontSize: 8, textAlign: 'right', color: '#6B7280' },
  cCall:    { width: 44, fontSize: 8, textAlign: 'right', color: '#6B7280' },
  cExtra:   { width: 44, fontSize: 8, textAlign: 'right', color: '#6B7280' },
  cNet:     { flex: 1,   fontSize: 8, textAlign: 'right', fontFamily: 'Helvetica-Bold' },
  cHours:   { width: 40, fontSize: 8, textAlign: 'right' },

  // Per-driver summary
  summary:       { flexDirection: 'row', backgroundColor: '#EEF2FF', padding: '6 8', borderBottomWidth: 1, borderBottomColor: '#C7D2FE' },
  summaryLbl:    { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: '#3730A3' },
  summaryVal:    { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: '#3730A3', textAlign: 'right' },

  // Grand total
  grandBox:      { marginTop: 16, alignItems: 'flex-end' },
  grandInner:    { width: 280 },
  grandRow:      { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#4F46E5', borderRadius: 6, padding: '10 14' },
  grandLbl:      { fontFamily: 'Helvetica-Bold', color: '#ffffff', fontSize: 11 },
  grandVal:      { fontFamily: 'Helvetica-Bold', color: '#ffffff', textAlign: 'right', fontSize: 11 },

  // Empty state
  emptyRow:      { flexDirection: 'row', justifyContent: 'center', padding: '10 8' },
  emptyText:     { fontSize: 8.5, color: '#9CA3AF', fontStyle: 'italic' },

  footer:        { position: 'absolute', bottom: 24, left: 36, right: 36, borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 8 },
  footerText:    { fontSize: 7.5, color: '#9CA3AF', marginBottom: 2 },
});

export interface PayoutSheet {
  date: string;              // ISO
  shift: 'MORNING' | 'EVENING';
  vehicleNumber: string;
  grossEarnings: number;
  gasDeduction: number;
  debitFee: number;
  debitTransactionCount: number;
  callChargeDeduction: number;
  extraExpenseDeduction: number;
  hoursWorked: number;
  netDriverPay: number;
}

export interface PayoutDriverData {
  driverName: string;
  driverPhone?: string;
  sheets: PayoutSheet[];
  totalGross: number;
  totalDeductions: number;
  totalNetPay: number;
  totalHours: number;
}

function PayoutFooter() {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>{SENDER.name} · {SENDER.address}, {SENDER.city}</Text>
      <Text style={s.footerText}>{SENDER.phone} · {SENDER.email}</Text>
    </View>
  );
}

function DriverBlock({ data }: { data: PayoutDriverData }) {
  const fmt = (v: number) => formatCurrency(v);
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  };

  return (
    <View wrap={true}>
      <View style={s.driverHeader}>
        <View>
          <Text style={s.driverName}>{data.driverName}</Text>
          {data.driverPhone ? <Text style={s.driverMeta}>{data.driverPhone}</Text> : null}
        </View>
        <Text style={s.driverMeta}>{data.sheets.length} sheet{data.sheets.length !== 1 ? 's' : ''} · {data.totalHours.toFixed(1)} hrs</Text>
      </View>

      <View style={s.tableHeader}>
        <Text style={[s.colHdr, s.cDate]}>Date</Text>
        <Text style={[s.colHdr, s.cShift]}>Shift</Text>
        <Text style={[s.colHdr, s.cVehicle]}>Cab</Text>
        <Text style={[s.colHdr, s.cGross]}>Gross</Text>
        <Text style={[s.colHdr, s.cGas]}>Gas</Text>
        <Text style={[s.colHdr, s.cDebit]}>Debit</Text>
        <Text style={[s.colHdr, s.cCall]}>Call</Text>
        <Text style={[s.colHdr, s.cExtra]}>Extra</Text>
        <Text style={[s.colHdr, s.cHours]}>Hrs</Text>
        <Text style={[s.colHdr, s.cNet]}>Net Pay</Text>
      </View>

      {data.sheets.length === 0 ? (
        <View style={s.emptyRow}>
          <Text style={s.emptyText}>No daily sheets recorded for this period</Text>
        </View>
      ) : data.sheets.map((row, i) => {
        const debit = row.debitFee * row.debitTransactionCount;
        return (
          <View key={i} style={s.tableRow} wrap={false}>
            <Text style={s.cDate}>{fmtDate(row.date)}</Text>
            <Text style={s.cShift}>{row.shift === 'MORNING' ? 'AM' : 'PM'}</Text>
            <Text style={s.cVehicle}>#{row.vehicleNumber}</Text>
            <Text style={s.cGross}>{fmt(row.grossEarnings)}</Text>
            <Text style={s.cGas}>{row.gasDeduction ? fmt(row.gasDeduction) : '—'}</Text>
            <Text style={s.cDebit}>{debit ? fmt(debit) : '—'}</Text>
            <Text style={s.cCall}>{row.callChargeDeduction ? fmt(row.callChargeDeduction) : '—'}</Text>
            <Text style={s.cExtra}>{row.extraExpenseDeduction ? fmt(row.extraExpenseDeduction) : '—'}</Text>
            <Text style={s.cHours}>{row.hoursWorked.toFixed(1)}</Text>
            <Text style={[s.cNet, { color: row.netDriverPay < 0 ? '#DC2626' : '#111827' }]}>{fmt(row.netDriverPay)}</Text>
          </View>
        );
      })}

      {/* Driver summary row */}
      <View style={s.summary}>
        <Text style={[s.summaryLbl, s.cDate]}>Totals</Text>
        <Text style={s.cShift} />
        <Text style={s.cVehicle} />
        <Text style={[s.summaryVal, s.cGross]}>{fmt(data.totalGross)}</Text>
        <Text style={s.cGas} />
        <Text style={s.cDebit} />
        <Text style={s.cCall} />
        <Text style={[s.summaryVal, s.cExtra]}>−{fmt(data.totalDeductions)}</Text>
        <Text style={[s.summaryVal, s.cHours]}>{data.totalHours.toFixed(1)}</Text>
        <Text style={[s.summaryVal, s.cNet, { color: data.totalNetPay < 0 ? '#DC2626' : '#3730A3' }]}>{fmt(data.totalNetPay)}</Text>
      </View>
    </View>
  );
}

function PayoutDoc({
  drivers, period, month, year,
}: {
  drivers: PayoutDriverData[];
  period: 1 | 2 | 3;
  month: number;
  year: number;
}) {
  const monthName = MONTHS[month - 1];
  const periodLabel = formatPeriodLabel(period, month, year);
  const generated = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
  const grand = drivers.reduce((sum, d) => sum + d.totalNetPay, 0);
  const grandGross = drivers.reduce((sum, d) => sum + d.totalGross, 0);

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
            <Text style={s.title}>PAYOUT</Text>
            <Text style={s.subtitle}>Period {period} · {monthName} {year}</Text>
          </View>
        </View>

        {/* Summary band */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, paddingHorizontal: 2 }}>
          <View>
            <Text style={{ fontSize: 8, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Period Dates</Text>
            <Text style={[s.bold, { fontSize: 10 }]}>{periodLabel}</Text>
          </View>
          <View>
            <Text style={{ fontSize: 8, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Drivers</Text>
            <Text style={[s.bold, { fontSize: 10 }]}>{drivers.length}</Text>
          </View>
          <View>
            <Text style={{ fontSize: 8, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Generated</Text>
            <Text style={[s.bold, { fontSize: 10 }]}>{generated}</Text>
          </View>
        </View>

        <View style={s.divider} />

        {drivers.map((d, i) => <DriverBlock key={i} data={d} />)}

        {/* Grand total only for multi-driver reports */}
        {drivers.length > 1 && (
          <View style={s.grandBox}>
            <View style={s.grandInner}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5, paddingHorizontal: 2 }}>
                <Text style={{ fontSize: 9, color: '#6B7280' }}>Total Gross (all drivers)</Text>
                <Text style={{ fontSize: 9, textAlign: 'right' }}>{formatCurrency(grandGross)}</Text>
              </View>
              <View style={s.grandRow}>
                <Text style={s.grandLbl}>Grand Total Net Pay</Text>
                <Text style={[s.grandVal, { color: grand < 0 ? '#FCA5A5' : '#ffffff' }]}>{formatCurrency(grand)}</Text>
              </View>
            </View>
          </View>
        )}

        <PayoutFooter />
      </Page>
    </Document>
  );
}

export async function renderPayoutPDF(
  drivers: PayoutDriverData[],
  period: 1 | 2 | 3,
  month: number,
  year: number,
): Promise<Buffer> {
  return renderToBuffer(
    <PayoutDoc drivers={drivers} period={period} month={month} year={year} />
  ) as Promise<Buffer>;
}
