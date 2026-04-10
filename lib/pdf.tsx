// SERVER-SIDE ONLY — never import from client components
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { formatCurrency } from './tax';
import { SENDER } from './constants';
import type { Company, Invoice, Ride } from '@prisma/client';

const styles = StyleSheet.create({
  page:             { fontFamily: 'Helvetica', fontSize: 10, padding: 44, color: '#111827', backgroundColor: '#ffffff' },
  bold:             { fontFamily: 'Helvetica-Bold' },

  header:           { marginBottom: 28 },
  headerName:       { fontFamily: 'Helvetica-Bold', fontSize: 15, marginBottom: 5, color: '#111827' },
  headerSub:        { fontSize: 9, color: '#6B7280', marginBottom: 2 },

  invoiceTitle:     { fontFamily: 'Helvetica-Bold', fontSize: 26, textAlign: 'right', marginBottom: 24, color: '#4F46E5' },

  metaSection:      { flexDirection: 'row', marginBottom: 32 },
  billToBlock:      { flex: 1 },
  metaBlock:        { flex: 1, alignItems: 'flex-end' },
  sectionLabel:     { fontFamily: 'Helvetica-Bold', fontSize: 8, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.8, color: '#9CA3AF' },
  metaRow:          { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 4 },
  metaKey:          { color: '#6B7280', marginRight: 10, fontSize: 9 },
  metaValue:        { fontFamily: 'Helvetica-Bold', fontSize: 9 },

  divider:          { borderBottomWidth: 1, borderBottomColor: '#E5E7EB', marginBottom: 12 },

  tableHeader:      { flexDirection: 'row', backgroundColor: '#F9FAFB', padding: '7 10', borderTopWidth: 1, borderTopColor: '#E5E7EB', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  tableRow:         { flexDirection: 'row', padding: '8 10', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  colDesc:          { flex: 1, fontSize: 9, color: '#374151' },
  colAmt:           { width: 90, textAlign: 'right', fontSize: 9 },
  colDescHeader:    { flex: 1, fontFamily: 'Helvetica-Bold', fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6B7280' },
  colAmtHeader:     { width: 90, textAlign: 'right', fontFamily: 'Helvetica-Bold', fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6B7280' },

  totalsWrap:       { alignItems: 'flex-end', marginTop: 8 },
  subtotalRow:      { flexDirection: 'row', marginBottom: 5 },
  totalLbl:         { width: 100, textAlign: 'right', marginRight: 20, fontSize: 9, color: '#6B7280' },
  totalVal:         { width: 80, textAlign: 'right', fontSize: 9 },
  balanceRow:       { flexDirection: 'row', backgroundColor: '#4F46E5', borderRadius: 6, padding: '9 14', marginTop: 8 },
  balanceLbl:       { flex: 1, fontFamily: 'Helvetica-Bold', color: '#ffffff', textAlign: 'right', marginRight: 20, fontSize: 10 },
  balanceVal:       { width: 80, fontFamily: 'Helvetica-Bold', color: '#ffffff', textAlign: 'right', fontSize: 10 },

  footer:           { position: 'absolute', bottom: 30, left: 44, right: 44, borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 10 },
  footerText:       { fontSize: 8, color: '#9CA3AF', textAlign: 'center', marginBottom: 2 },

  // Page 2
  p2Title:          { fontFamily: 'Helvetica-Bold', fontSize: 13, marginBottom: 18, color: '#111827' },
  p2ColDate:        { width: 75, fontSize: 9 },
  p2ColPickup:      { flex: 1, fontSize: 9 },
  p2ColDropoff:     { flex: 1, fontSize: 9 },
  p2ColCab:         { width: 48, textAlign: 'center', fontSize: 9 },
  p2ColAmt:         { width: 70, textAlign: 'right', fontSize: 9 },
  p2ColHdr:         { fontFamily: 'Helvetica-Bold', fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6B7280' },
});

function InvoiceDoc({ company, rides, invoice }: { company: Company; rides: Ride[]; invoice: Invoice }) {
  const dateSent = invoice.dateSent ? format(new Date(invoice.dateSent), 'MMMM d, yyyy') : '—';
  const dueDate  = invoice.dueDate  ? format(new Date(invoice.dueDate),  'MMMM d, yyyy') : '—';

  return (
    <Document>
      {/* ── Page 1: Summary ── */}
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.headerName}>{SENDER.name}</Text>
          <Text style={styles.headerSub}>{SENDER.address}</Text>
          <Text style={styles.headerSub}>{SENDER.city}</Text>
          <Text style={styles.headerSub}>{SENDER.phone}</Text>
          <Text style={styles.headerSub}>{SENDER.email}</Text>
        </View>

        <Text style={styles.invoiceTitle}>INVOICE</Text>

        <View style={styles.metaSection}>
          <View style={styles.billToBlock}>
            <Text style={styles.sectionLabel}>Bill To</Text>
            <Text style={[styles.bold, { marginBottom: 3, fontSize: 11 }]}>{company.companyName}</Text>
            <Text style={{ fontSize: 9, color: '#6B7280', lineHeight: 1.5 }}>{company.address}</Text>
            {company.poNumber ? (
              <Text style={{ fontSize: 9, color: '#374151', marginTop: 6 }}>PO # {company.poNumber}</Text>
            ) : null}
          </View>
          <View style={styles.metaBlock}>
            {[
              ['Invoice #', String(invoice.invoiceNumber)],
              ['Date',      dateSent],
              ['Terms',     'Net 30'],
              ['Due Date',  dueDate],
            ].map(([k, v]) => (
              <View key={k} style={styles.metaRow}>
                <Text style={styles.metaKey}>{k}</Text>
                <Text style={styles.metaValue}>{v}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.divider} />

        {/* Table */}
        <View style={styles.tableHeader}>
          <Text style={styles.colDescHeader}>Description</Text>
          <Text style={styles.colAmtHeader}>Amount</Text>
        </View>
        <View style={styles.tableRow}>
          <Text style={styles.colDesc}>Rides for {invoice.month} {invoice.year}</Text>
          <Text style={styles.colAmt}>{formatCurrency(invoice.amountPreTax)}</Text>
        </View>

        {/* Totals */}
        <View style={styles.totalsWrap}>
          <View style={styles.subtotalRow}>
            <Text style={styles.totalLbl}>Subtotal</Text>
            <Text style={styles.totalVal}>{formatCurrency(invoice.amountPreTax)}</Text>
          </View>
          <View style={styles.subtotalRow}>
            <Text style={styles.totalLbl}>HST (13%)</Text>
            <Text style={styles.totalVal}>{formatCurrency(invoice.hst)}</Text>
          </View>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLbl}>Balance Due</Text>
            <Text style={styles.balanceVal}>{formatCurrency(invoice.total)}</Text>
          </View>
        </View>

        {invoice.notes ? (
          <View style={{ marginTop: 24, padding: '10 12', backgroundColor: '#F9FAFB', borderRadius: 6 }}>
            <Text style={[styles.sectionLabel, { marginBottom: 4 }]}>Notes</Text>
            <Text style={{ fontSize: 9, color: '#374151', lineHeight: 1.6 }}>{invoice.notes}</Text>
          </View>
        ) : null}

        <View style={styles.footer}>
          <Text style={styles.footerText}>All cheques payable to {SENDER.name}</Text>
          <Text style={styles.footerText}>Email: {SENDER.email}  ·  HST # {SENDER.hst}  ·  Due 30 days from invoice date</Text>
        </View>
      </Page>

      {/* ── Page 2: Ride List ── */}
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.p2Title}>
          Ride Details — {invoice.month} {invoice.year} — {company.companyName}
        </Text>

        <View style={styles.tableHeader}>
          {(['Date', 'Pickup', 'Dropoff', 'Cab #', 'Amount'] as const).map((h, i) => (
            <Text key={h} style={[
              styles.p2ColHdr,
              i === 0 ? styles.p2ColDate :
              i === 1 ? styles.p2ColPickup :
              i === 2 ? styles.p2ColDropoff :
              i === 3 ? styles.p2ColCab : styles.p2ColAmt,
            ]}>{h}</Text>
          ))}
        </View>

        {rides.map((ride, i) => (
          <View key={i} style={styles.tableRow} wrap={false}>
            <Text style={styles.p2ColDate}>{ride.dateTime}</Text>
            <Text style={styles.p2ColPickup}>{ride.pickupLocation}</Text>
            <Text style={styles.p2ColDropoff}>{ride.dropoffLocation}</Text>
            <Text style={styles.p2ColCab}>{ride.vehicleNumber}</Text>
            <Text style={styles.p2ColAmt}>{formatCurrency(ride.amount)}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}

export async function renderInvoicePDF(company: Company, rides: Ride[], invoice: Invoice): Promise<Buffer> {
  return renderToBuffer(<InvoiceDoc company={company} rides={rides} invoice={invoice} />) as Promise<Buffer>;
}
