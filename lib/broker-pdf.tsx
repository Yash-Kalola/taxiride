// SERVER-SIDE ONLY — never import from client components
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import * as fs from 'fs';
import * as path from 'path';
import { formatCurrency } from './tax';
import { SENDER, MONTHS } from './constants';

// Load logo once at module level
function loadLogoBase64(): string | null {
  try {
    const logoPath = path.join(process.cwd(), 'public', 'logo.png');
    const buf = fs.readFileSync(logoPath);
    const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8;
    const mime   = isJpeg ? 'image/jpeg' : 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}
const LOGO_SRC = loadLogoBase64();

const TYPE_LABELS: Record<string, string> = {
  STAND_RENT:      'Stand Rent',
  COMPANY_PAYMENT: 'Company Payment',
  PRODUCT_CHARGE:  'Product Charge',
  INSURANCE:       'Insurance',
  PAYOUT:          'Payout',
  OTHER:           'Other',
  EXPENSE:         'Expense',
};

const s = StyleSheet.create({
  page:          { fontFamily: 'Helvetica', fontSize: 10, padding: 44, color: '#111827', backgroundColor: '#ffffff' },
  bold:          { fontFamily: 'Helvetica-Bold' },

  // Header
  headerRow:     { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 28 },
  headerLogo:    { width: 100, marginRight: 16 },
  headerInfo:    { flex: 1 },
  headerName:    { fontFamily: 'Helvetica-Bold', fontSize: 15, marginBottom: 4, color: '#111827' },
  headerSub:     { fontSize: 9, color: '#6B7280', marginBottom: 2 },

  title:         { fontFamily: 'Helvetica-Bold', fontSize: 26, textAlign: 'right', marginBottom: 24, color: '#4F46E5' },

  // Meta section
  metaSection:   { flexDirection: 'row', marginBottom: 28 },
  metaLeft:      { flex: 1 },
  metaRight:     { flex: 1, alignItems: 'flex-end' },
  sectionLabel:  { fontFamily: 'Helvetica-Bold', fontSize: 8, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.8, color: '#9CA3AF' },
  metaRow:       { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 4 },
  metaKey:       { color: '#6B7280', marginRight: 10, fontSize: 9 },
  metaValue:     { fontFamily: 'Helvetica-Bold', fontSize: 9 },

  divider:       { borderBottomWidth: 1, borderBottomColor: '#E5E7EB', marginBottom: 12 },

  // Table
  tableHeader:   { flexDirection: 'row', backgroundColor: '#F9FAFB', padding: '7 10', borderTopWidth: 1, borderTopColor: '#E5E7EB', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  tableRow:      { flexDirection: 'row', padding: '6 10', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  colHdr:        { fontFamily: 'Helvetica-Bold', fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6B7280' },

  // Transaction columns
  txColType:     { width: 80, fontSize: 9 },
  txColDesc:     { flex: 1, fontSize: 9, color: '#374151' },
  txColAmt:      { width: 75, textAlign: 'right', fontSize: 9 },
  txColStatus:   { width: 55, textAlign: 'center', fontSize: 8 },

  // Ride columns (page 2)
  rColDate:      { width: 75, fontSize: 9 },
  rColPickup:    { flex: 1, fontSize: 9 },
  rColDropoff:   { flex: 1, fontSize: 9 },
  rColCab:       { width: 48, textAlign: 'center', fontSize: 9 },
  rColAmt:       { width: 70, textAlign: 'right', fontSize: 9 },

  // Totals
  totalsWrap:    { alignItems: 'flex-end', marginTop: 20 },
  totalsBox:     { width: 240 },
  subtotalRow:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7, paddingHorizontal: 2 },
  totalLbl:      { fontSize: 9, color: '#6B7280' },
  totalVal:      { fontSize: 9, textAlign: 'right' },
  totalsDivider: { borderBottomWidth: 1, borderBottomColor: '#E5E7EB', marginBottom: 8 },
  balanceRow:    { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#4F46E5', borderRadius: 6, padding: '11 14' },
  balanceLbl:    { fontFamily: 'Helvetica-Bold', color: '#ffffff', fontSize: 11 },
  balanceVal:    { fontFamily: 'Helvetica-Bold', color: '#ffffff', textAlign: 'right', fontSize: 11 },

  // Footer
  footer:        { position: 'absolute', bottom: 30, left: 44, right: 44, borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 10 },
  footerText:    { fontSize: 8, color: '#9CA3AF', marginBottom: 3 },

  // Status badges
  statusPaid:    { color: '#059669', fontFamily: 'Helvetica-Bold' },
  statusPending: { color: '#D97706' },
  statusVoid:    { color: '#DC2626', textDecorationLine: 'line-through' },

  p2Title:       { fontFamily: 'Helvetica-Bold', fontSize: 13, marginBottom: 18, color: '#111827' },
});

interface StatementTx {
  type: string;
  description: string;
  amount: number;
  status: string;
}

interface StatementRide {
  dateTime: string;
  pickupLocation: string;
  dropoffLocation: string;
  vehicleNumber: string;
  amount: number;
}

function StatementFooter() {
  return (
    <View style={s.footer}>
      <Text style={s.footerText}>{SENDER.name}</Text>
      <Text style={s.footerText}>{SENDER.address}, {SENDER.city}</Text>
      <Text style={s.footerText}>{SENDER.phone}  ·  {SENDER.email}</Text>
    </View>
  );
}

function StatementDoc({
  broker,
  transactions,
  rides,
  month,
  year,
}: {
  broker: { name: string; phone: string };
  transactions: StatementTx[];
  rides: StatementRide[];
  month: number;
  year: number;
}) {
  const monthName = MONTHS[month - 1];
  const today = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });

  const totalCharges = transactions.filter(t => t.type !== 'PAYOUT' && t.status !== 'VOID').reduce((s, t) => s + t.amount, 0);
  const totalPaid    = transactions.filter(t => t.type !== 'PAYOUT' && t.status === 'PAID').reduce((s, t) => s + t.amount, 0);
  const balance      = totalCharges - totalPaid;
  const totalRides   = rides.reduce((s, r) => s + r.amount, 0);

  return (
    <Document>
      {/* ── Page 1: Transactions ── */}
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
        </View>

        <Text style={s.title}>STATEMENT</Text>

        {/* Meta */}
        <View style={s.metaSection}>
          <View style={s.metaLeft}>
            <Text style={s.sectionLabel}>Broker</Text>
            <Text style={[s.bold, { fontSize: 11, marginBottom: 3 }]}>{broker.name}</Text>
            {broker.phone ? <Text style={{ fontSize: 9, color: '#6B7280' }}>{broker.phone}</Text> : null}
          </View>
          <View style={s.metaRight}>
            {[
              ['Period',    `${monthName} ${year}`],
              ['Generated', today],
            ].map(([k, v]) => (
              <View key={k} style={s.metaRow}>
                <Text style={s.metaKey}>{k}</Text>
                <Text style={s.metaValue}>{v}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={s.divider} />

        {/* Transactions table */}
        <View style={s.tableHeader}>
          <Text style={[s.colHdr, s.txColType]}>Type</Text>
          <Text style={[s.colHdr, s.txColDesc]}>Description</Text>
          <Text style={[s.colHdr, s.txColAmt]}>Amount</Text>
          <Text style={[s.colHdr, s.txColStatus]}>Status</Text>
        </View>
        {transactions.map((tx, i) => (
          <View key={i} style={s.tableRow} wrap={false}>
            <Text style={s.txColType}>{TYPE_LABELS[tx.type] ?? tx.type}</Text>
            <Text style={s.txColDesc}>{tx.description || '—'}</Text>
            <Text style={s.txColAmt}>{formatCurrency(tx.amount)}</Text>
            <Text style={[
              s.txColStatus,
              tx.status === 'PAID' ? s.statusPaid : tx.status === 'VOID' ? s.statusVoid : s.statusPending,
            ]}>{tx.status}</Text>
          </View>
        ))}

        {transactions.length === 0 && (
          <View style={[s.tableRow, { justifyContent: 'center' }]}>
            <Text style={{ fontSize: 9, color: '#9CA3AF' }}>No transactions for this period</Text>
          </View>
        )}

        {/* Totals */}
        <View style={s.totalsWrap}>
          <View style={s.totalsBox}>
            <View style={s.subtotalRow}>
              <Text style={s.totalLbl}>Total Charges</Text>
              <Text style={s.totalVal}>{formatCurrency(totalCharges)}</Text>
            </View>
            <View style={s.subtotalRow}>
              <Text style={s.totalLbl}>Total Paid</Text>
              <Text style={s.totalVal}>{formatCurrency(totalPaid)}</Text>
            </View>
            <View style={s.totalsDivider} />
            <View style={s.balanceRow}>
              <Text style={s.balanceLbl}>Balance Remaining</Text>
              <Text style={s.balanceVal}>{formatCurrency(balance)}</Text>
            </View>
          </View>
        </View>

        <StatementFooter />
      </Page>

      {/* ── Page 2: Rides ── */}
      {rides.length > 0 && (
        <Page size="LETTER" style={s.page}>
          <Text style={s.p2Title}>
            Rides — {monthName} {year} — {broker.name}
          </Text>

          <View style={s.tableHeader}>
            {(['Date', 'Pickup', 'Drop Off', 'Cab #', 'Amount'] as const).map((h, i) => (
              <Text key={h} style={[
                s.colHdr,
                i === 0 ? s.rColDate   :
                i === 1 ? s.rColPickup :
                i === 2 ? s.rColDropoff:
                i === 3 ? s.rColCab    : s.rColAmt,
              ]}>{h}</Text>
            ))}
          </View>

          {rides.map((ride, i) => (
            <View key={i} style={s.tableRow} wrap={false}>
              <Text style={s.rColDate}>{ride.dateTime || '—'}</Text>
              <Text style={s.rColPickup}>{ride.pickupLocation || '—'}</Text>
              <Text style={s.rColDropoff}>{ride.dropoffLocation || '—'}</Text>
              <Text style={s.rColCab}>{ride.vehicleNumber}</Text>
              <Text style={s.rColAmt}>{formatCurrency(ride.amount)}</Text>
            </View>
          ))}

          {/* Ride total */}
          <View style={s.totalsWrap}>
            <View style={s.totalsBox}>
              <View style={s.balanceRow}>
                <Text style={s.balanceLbl}>Total Rides ({rides.length})</Text>
                <Text style={s.balanceVal}>{formatCurrency(totalRides)}</Text>
              </View>
            </View>
          </View>

          <StatementFooter />
        </Page>
      )}
    </Document>
  );
}

export async function renderBrokerStatementPDF(
  broker: { name: string; phone: string },
  transactions: StatementTx[],
  rides: StatementRide[],
  month: number,
  year: number,
): Promise<Buffer> {
  return renderToBuffer(
    <StatementDoc broker={broker} transactions={transactions} rides={rides} month={month} year={year} />
  ) as Promise<Buffer>;
}
