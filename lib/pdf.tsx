// SERVER-SIDE ONLY — never import from client components
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { format } from 'date-fns';
import * as fs from 'fs';
import * as path from 'path';
import { formatCurrency } from './tax';
import { SENDER, BANKING } from './constants';
import type { Company, Invoice, Ride } from '@prisma/client';

// Load an image once at module level — graceful fallback if not present.
// Detects actual MIME type from magic bytes so JPEG files named .png work correctly.
function loadImageBase64(relativePath: string): string | null {
  try {
    const buf = fs.readFileSync(path.join(process.cwd(), 'public', relativePath));
    const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8;
    const mime   = isJpeg ? 'image/jpeg' : 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}
const LOGO_SRC = loadImageBase64('logo.png');
const QR_SRC   = loadImageBase64('assets/scan-to-pay.png');

const styles = StyleSheet.create({
  page:          { fontFamily: 'Helvetica', fontSize: 10, padding: 44, color: '#111827', backgroundColor: '#ffffff' },
  bold:          { fontFamily: 'Helvetica-Bold' },

  // Header
  headerRow:     { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 28 },
  headerLogo:    { width: 100, marginRight: 16 },   // height auto-scales to preserve aspect ratio
  headerInfo:    { flex: 1 },
  headerName:    { fontFamily: 'Helvetica-Bold', fontSize: 15, marginBottom: 4, color: '#111827' },
  headerSub:     { fontSize: 9, color: '#6B7280', marginBottom: 2 },

  invoiceTitle:  { fontFamily: 'Helvetica-Bold', fontSize: 26, textAlign: 'right', marginBottom: 24, color: '#4F46E5' },

  // Bill To / Invoice meta
  metaSection:   { flexDirection: 'row', marginBottom: 32 },
  billToBlock:   { flex: 1 },
  metaBlock:     { flex: 1, alignItems: 'flex-end' },
  sectionLabel:  { fontFamily: 'Helvetica-Bold', fontSize: 8, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.8, color: '#9CA3AF' },
  metaRow:       { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 4 },
  metaKey:       { color: '#6B7280', marginRight: 10, fontSize: 9 },
  metaValue:     { fontFamily: 'Helvetica-Bold', fontSize: 9 },

  divider:       { borderBottomWidth: 1, borderBottomColor: '#E5E7EB', marginBottom: 12 },

  // Line-item table
  tableHeader:   { flexDirection: 'row', backgroundColor: '#F9FAFB', padding: '7 10', borderTopWidth: 1, borderTopColor: '#E5E7EB', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  tableRow:      { flexDirection: 'row', padding: '8 10', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  colDesc:       { flex: 1, fontSize: 9, color: '#374151' },
  colAmt:        { width: 90, textAlign: 'right', fontSize: 9 },
  colDescHeader: { flex: 1, fontFamily: 'Helvetica-Bold', fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6B7280' },
  colAmtHeader:  { width: 90, textAlign: 'right', fontFamily: 'Helvetica-Bold', fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6B7280' },

  // Totals — fixed-width box so flex children behave correctly
  totalsWrap:    { alignItems: 'flex-end', marginTop: 20 },
  totalsBox:     { width: 240 },
  subtotalRow:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7, paddingHorizontal: 2 },
  totalLbl:      { fontSize: 9, color: '#6B7280' },
  totalVal:      { fontSize: 9, textAlign: 'right' },
  totalsDivider: { borderBottomWidth: 1, borderBottomColor: '#E5E7EB', marginBottom: 8 },
  balanceRow:    { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#4F46E5', borderRadius: 6, padding: '11 14' },
  balanceLbl:    { fontFamily: 'Helvetica-Bold', color: '#ffffff', fontSize: 11 },
  balanceVal:    { fontFamily: 'Helvetica-Bold', color: '#ffffff', textAlign: 'right', fontSize: 11 },

  // Footer (shared across both pages)
  footer:         { position: 'absolute', bottom: 30, left: 44, right: 44, borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 10 },
  footerRow:      { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  footerLeft:     { flex: 1 },
  footerText:     { fontSize: 8, color: '#9CA3AF', marginBottom: 3 },
  footerBankBox:  { backgroundColor: '#EEF2FF', borderRadius: 5, padding: '7 10', minWidth: 160 },
  footerBankTitle:{ fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: '#4F46E5', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.6 },
  footerBankRow:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  footerBankKey:  { fontSize: 7.5, color: '#6B7280' },
  footerBankVal:  { fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: '#374151' },

  footerQrBox:    { alignItems: 'center', marginRight: 12 },
  footerQrLabel:  { fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: '#4F46E5', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.6 },
  footerQrImg:    { width: 60, height: 60 },
  footerQrHint:   { fontSize: 7, color: '#6B7280', marginTop: 2 },

  // Page 2 ride table — LEGAL landscape (14" × 8.5"). Column widths tuned
  // to fit Trip ID | Date | Customer | Phone | Pickup | Dropoff | Cab | Amount
  // without wrapping the tabular fields; pickup/dropoff flex to take remaining space.
  p2Page:        { fontFamily: 'Helvetica', fontSize: 8.5, padding: 24, color: '#111827', backgroundColor: '#ffffff' },
  p2Header:      { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  p2HeaderLogo:  { width: 60, marginRight: 12 },
  p2HeaderInfo:  { flex: 1 },
  p2HeaderBrand: { fontFamily: 'Helvetica-Bold', fontSize: 11, color: '#111827' },
  p2HeaderMeta:  { fontSize: 8, color: '#6B7280' },
  p2TitleBlock:  { alignItems: 'flex-end' },
  p2TitleTop:    { fontSize: 8, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 },
  p2Title:       { fontFamily: 'Helvetica-Bold', fontSize: 14, color: '#4F46E5' },
  p2SubTitle:    { fontSize: 9, color: '#6B7280', marginTop: 2, textAlign: 'right' },

  p2TableHeader: { flexDirection: 'row', backgroundColor: '#F3F4F6', padding: '5 6', borderTopWidth: 1, borderTopColor: '#E5E7EB', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  p2Row:         { flexDirection: 'row', padding: '4 6', borderBottomWidth: 0.5, borderBottomColor: '#F3F4F6' },
  p2RowAlt:      { backgroundColor: '#FAFAFA' },
  p2ColHdr:      { fontFamily: 'Helvetica-Bold', fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 0.3, color: '#6B7280' },

  p2ColJob:      { width: 72,  fontSize: 8 },
  p2ColDate:     { width: 78,  fontSize: 8 },
  p2ColCust:     { width: 96,  fontSize: 8 },
  p2ColPhone:    { width: 82,  fontSize: 8 },
  p2ColPickup:   { flex: 1,    fontSize: 8 },
  p2ColDropoff:  { flex: 1,    fontSize: 8 },
  p2ColCab:      { width: 36,  fontSize: 8, textAlign: 'center' },
  p2ColAmt:      { width: 64,  fontSize: 8, textAlign: 'right', fontFamily: 'Helvetica-Bold' },

  p2TotalRow:    { flexDirection: 'row', padding: '6 6', backgroundColor: '#EEF2FF', borderTopWidth: 1, borderTopColor: '#C7D2FE' },
  p2TotalLbl:    { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: '#3730A3' },
  p2TotalVal:    { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: '#3730A3', textAlign: 'right' },

  p2Footer:      { position: 'absolute', bottom: 16, left: 24, right: 24, borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 6, flexDirection: 'row', justifyContent: 'space-between' },
  p2FooterText:  { fontSize: 7, color: '#9CA3AF' },
});

function PageFooter() {
  return (
    <View style={styles.footer}>
      <View style={styles.footerRow}>
        {/* Left: payment instructions */}
        <View style={styles.footerLeft}>
          <Text style={styles.footerText}>All cheques payable to {SENDER.name}</Text>
          <Text style={styles.footerText}>Due 30 days from date of invoice</Text>
          <Text style={styles.footerText}>Pay by debit or credit — scan the QR code on the right</Text>
          <Text style={styles.footerText}>To pay by e-transfer, email {SENDER.headerEmail}</Text>
          <Text style={styles.footerText}>For EFT, use the banking details →</Text>
        </View>
        {/* Middle: Pay-by-QR */}
        {QR_SRC && (
          <View style={styles.footerQrBox}>
            <Text style={styles.footerQrLabel}>Pay by Debit / Credit</Text>
            <Image src={QR_SRC} style={styles.footerQrImg} />
            <Text style={styles.footerQrHint}>Scan to pay</Text>
          </View>
        )}
        {/* Right: banking block */}
        <View style={styles.footerBankBox}>
          <Text style={styles.footerBankTitle}>Direct Deposit / EFT</Text>
          {[
            ['Branch',      BANKING.branch],
            ['Institution', BANKING.institution],
            ['Account',     BANKING.account],
          ].map(([k, v]) => (
            <View key={k} style={styles.footerBankRow}>
              <Text style={styles.footerBankKey}>{k}</Text>
              <Text style={styles.footerBankVal}>{v}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function InvoiceDoc({ company, rides, invoice }: { company: Company; rides: Ride[]; invoice: Invoice }) {
  const dateSent = invoice.dateSent ? format(new Date(invoice.dateSent), 'MMMM d, yyyy') : '—';
  const dueDate  = invoice.dueDate  ? format(new Date(invoice.dueDate),  'MMMM d, yyyy') : '—';

  return (
    <Document>
      {/* ── Page 1: Summary ── */}
      <Page size="LETTER" style={styles.page}>

        {/* Header: logo + sender info */}
        <View style={styles.headerRow}>
          {LOGO_SRC && <Image src={LOGO_SRC} style={styles.headerLogo} />}
          <View style={styles.headerInfo}>
            <Text style={styles.headerName}>{SENDER.name}</Text>
            <Text style={styles.headerSub}>{SENDER.address}</Text>
            <Text style={styles.headerSub}>{SENDER.city}</Text>
            <Text style={styles.headerSub}>{SENDER.phone}</Text>
            <Text style={styles.headerSub}>{SENDER.headerEmail}</Text>
            <Text style={[styles.headerSub, { marginTop: 3 }]}>HST # {SENDER.hst}</Text>
          </View>
        </View>

        <Text style={styles.invoiceTitle}>INVOICE</Text>

        {/* Bill To + Invoice meta */}
        <View style={styles.metaSection}>
          <View style={styles.billToBlock}>
            <Text style={styles.sectionLabel}>Bill To</Text>
            <Text style={[styles.bold, { marginBottom: 3, fontSize: 11 }]}>{company.companyName}</Text>
            {company.contactName ? (
              <Text style={{ fontSize: 9, color: '#374151', marginBottom: 3 }}>Attn: {company.contactName}</Text>
            ) : null}
            <Text style={{ fontSize: 9, color: '#6B7280', lineHeight: 1.5 }}>{company.address}</Text>
            {company.poNumber ? (
              <Text style={{ fontSize: 9, color: '#374151', marginTop: 6 }}>PO # {company.poNumber}</Text>
            ) : null}
          </View>
          <View style={styles.metaBlock}>
            {[
              ['Invoice #',    String(invoice.invoiceNumber)],
              ['Invoice Date', dateSent],
              ['Terms',        'Net 30'],
              ['Due Date',     dueDate],
            ].map(([k, v]) => (
              <View key={k} style={styles.metaRow}>
                <Text style={styles.metaKey}>{k}</Text>
                <Text style={styles.metaValue}>{v}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.divider} />

        {/* Line-item table */}
        <View style={styles.tableHeader}>
          <Text style={styles.colDescHeader}>Description</Text>
          <Text style={styles.colAmtHeader}>Amount</Text>
        </View>
        <View style={styles.tableRow}>
          <Text style={styles.colDesc}>
            {rides.length} corporate ride{rides.length !== 1 ? 's' : ''} — {invoice.month} {invoice.year}
          </Text>
          <Text style={styles.colAmt}>{formatCurrency(invoice.amountPreTax)}</Text>
        </View>

        {/* Totals — fixed 240 px box so flex children expand correctly */}
        <View style={styles.totalsWrap}>
          <View style={styles.totalsBox}>
            <View style={styles.subtotalRow}>
              <Text style={styles.totalLbl}>Subtotal</Text>
              <Text style={styles.totalVal}>{formatCurrency(invoice.amountPreTax)}</Text>
            </View>
            <View style={styles.subtotalRow}>
              <Text style={styles.totalLbl}>HST (13%)</Text>
              <Text style={styles.totalVal}>{formatCurrency(invoice.hst)}</Text>
            </View>
            <View style={styles.totalsDivider} />
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLbl}>Balance Due</Text>
              <Text style={styles.balanceVal}>{formatCurrency(invoice.total)}</Text>
            </View>
          </View>
        </View>

        {invoice.notes ? (
          <View style={{ marginTop: 24, padding: '10 12', backgroundColor: '#F9FAFB', borderRadius: 6 }}>
            <Text style={[styles.sectionLabel, { marginBottom: 4 }]}>Notes</Text>
            <Text style={{ fontSize: 9, color: '#374151', lineHeight: 1.6 }}>{invoice.notes}</Text>
          </View>
        ) : null}

        <PageFooter />
      </Page>

      {/* ── Page 2: Ride Details (LEGAL landscape for full column visibility) ── */}
      <Page size="LEGAL" orientation="landscape" style={styles.p2Page}>
        {/* Compact header */}
        <View style={styles.p2Header}>
          {LOGO_SRC && <Image src={LOGO_SRC} style={styles.p2HeaderLogo} />}
          <View style={styles.p2HeaderInfo}>
            <Text style={styles.p2HeaderBrand}>{SENDER.name}</Text>
            <Text style={styles.p2HeaderMeta}>{SENDER.address}  ·  {SENDER.city}  ·  {SENDER.phone}</Text>
          </View>
          <View style={styles.p2TitleBlock}>
            <Text style={styles.p2TitleTop}>Invoice # {invoice.invoiceNumber}</Text>
            <Text style={styles.p2Title}>RIDE DETAILS</Text>
            <Text style={styles.p2SubTitle}>
              {company.companyName} — {invoice.month} {invoice.year} — {rides.length} ride{rides.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>

        {/* Table header */}
        <View style={styles.p2TableHeader} fixed>
          <Text style={[styles.p2ColHdr, styles.p2ColJob]}>Trip ID</Text>
          <Text style={[styles.p2ColHdr, styles.p2ColDate]}>Date / Time</Text>
          <Text style={[styles.p2ColHdr, styles.p2ColCust]}>Customer</Text>
          <Text style={[styles.p2ColHdr, styles.p2ColPhone]}>Phone</Text>
          <Text style={[styles.p2ColHdr, styles.p2ColPickup]}>Pickup</Text>
          <Text style={[styles.p2ColHdr, styles.p2ColDropoff]}>Dropoff</Text>
          <Text style={[styles.p2ColHdr, styles.p2ColCab]}>Cab</Text>
          <Text style={[styles.p2ColHdr, styles.p2ColAmt]}>Amount</Text>
        </View>

        {rides.map((ride, i) => (
          <View key={i} style={[styles.p2Row, i % 2 === 1 ? styles.p2RowAlt : {}]} wrap={false}>
            <Text style={styles.p2ColJob}>{ride.jobId || '—'}</Text>
            <Text style={styles.p2ColDate}>{ride.dateTime || '—'}</Text>
            <Text style={styles.p2ColCust}>{ride.passenger || '—'}</Text>
            <Text style={styles.p2ColPhone}>{ride.customerPhone || '—'}</Text>
            <Text style={styles.p2ColPickup}>{ride.pickupLocation || '—'}</Text>
            <Text style={styles.p2ColDropoff}>{ride.dropoffLocation || '—'}</Text>
            <Text style={styles.p2ColCab}>{ride.vehicleNumber || '—'}</Text>
            <Text style={styles.p2ColAmt}>{formatCurrency(ride.amount)}</Text>
          </View>
        ))}

        {/* Totals row */}
        <View style={styles.p2TotalRow}>
          <Text style={[styles.p2TotalLbl, styles.p2ColJob]}>Totals</Text>
          <Text style={[styles.p2TotalLbl, styles.p2ColDate]}>({rides.length} ride{rides.length !== 1 ? 's' : ''})</Text>
          <Text style={styles.p2ColCust} />
          <Text style={styles.p2ColPhone} />
          <Text style={styles.p2ColPickup} />
          <Text style={styles.p2ColDropoff} />
          <Text style={styles.p2ColCab} />
          <Text style={[styles.p2TotalVal, styles.p2ColAmt]}>
            {formatCurrency(rides.reduce((s, r) => s + r.amount, 0))}
          </Text>
        </View>

        <View style={styles.p2Footer} fixed>
          <Text style={styles.p2FooterText}>{SENDER.name}  ·  HST # {SENDER.hst}  ·  Invoice # {invoice.invoiceNumber}</Text>
          <Text
            style={styles.p2FooterText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

export async function renderInvoicePDF(company: Company, rides: Ride[], invoice: Invoice): Promise<Buffer> {
  return renderToBuffer(<InvoiceDoc company={company} rides={rides} invoice={invoice} />) as Promise<Buffer>;
}
