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
            <Text style={[styles.headerSub, styles.bold, { marginBottom: 3, color: '#374151' }]}>PO # {SENDER.poNumber}</Text>
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
          <View style={styles.colDesc}>
            <Text>
              {rides.length} corporate ride{rides.length !== 1 ? 's' : ''} — {invoice.month} {invoice.year}
            </Text>
            <Text style={{ fontSize: 8, color: '#9CA3AF', marginTop: 2 }}>
              See page 2 for full ride details — Trip ID, Customer Phone, Pickup, Dropoff, Cab #
            </Text>
          </View>
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

// ─────────────────────────────────────────────────────────────────────────
// Overview PDF — full year-at-a-glance grid (Company × Month) used on the
// /overview page Download PDF button.
// ─────────────────────────────────────────────────────────────────────────

const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;

const ovStyles = StyleSheet.create({
  page:     { fontFamily: 'Helvetica', fontSize: 8, padding: 28, color: '#111827', backgroundColor: '#ffffff' },
  title:    { fontFamily: 'Helvetica-Bold', fontSize: 18, color: '#4F46E5', marginBottom: 4 },
  subtitle: { fontSize: 9, color: '#6B7280', marginBottom: 16 },

  headerRow:  { flexDirection: 'row', backgroundColor: '#F3F4F6', borderTopWidth: 1, borderTopColor: '#E5E7EB', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  bodyRow:    { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#F3F4F6' },
  totalsRow:  { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#E5E7EB', backgroundColor: '#EEF2FF' },

  colCompany:    { width: 110, padding: '5 6', fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: '#374151' },
  colCompanyHdr: { width: 110, padding: '5 6', fontFamily: 'Helvetica-Bold', fontSize: 7, textTransform: 'uppercase', color: '#6B7280' },
  colMonth:      { flex: 1, padding: '5 4', textAlign: 'right', fontSize: 7.5, color: '#374151' },
  colMonthHdr:   { flex: 1, padding: '5 4', textAlign: 'center', fontFamily: 'Helvetica-Bold', fontSize: 7, textTransform: 'uppercase', color: '#6B7280' },
  colTotal:      { width: 60, padding: '5 6', textAlign: 'right', fontFamily: 'Helvetica-Bold', fontSize: 8, color: '#111827' },
  colTotalHdr:   { width: 60, padding: '5 6', textAlign: 'right', fontFamily: 'Helvetica-Bold', fontSize: 7, textTransform: 'uppercase', color: '#6B7280' },
  totalCell:     { fontFamily: 'Helvetica-Bold', color: '#3730A3' },

  smallFooter:   { position: 'absolute', bottom: 16, left: 28, right: 28, fontSize: 7, color: '#9CA3AF', textAlign: 'right' },
});

interface OverviewRow {
  companyName: string;
  byMonth: Record<string, number>; // month name → total
}

interface OverviewData {
  year:       number;
  rows:       OverviewRow[];
  monthTotals:Record<string, number>;
  grandTotal: number;
  generatedAt: Date;
  invoiceCount: number;
  companyCount: number;
}

function OverviewDoc({ data }: { data: OverviewData }) {
  // Only render months that have at least one invoice in the year (keeps it readable).
  const activeMonths = MONTHS_FULL.filter((m) => (data.monthTotals[m] ?? 0) > 0);
  // Fallback: if no month has data, show first 3 to avoid an empty grid.
  const months       = activeMonths.length > 0 ? activeMonths : MONTHS_FULL.slice(0, 3);

  return (
    <Document>
      <Page size="LEGAL" orientation="landscape" style={ovStyles.page}>
        <Text style={ovStyles.title}>Monthly Overview — {data.year}</Text>
        <Text style={ovStyles.subtitle}>
          {data.companyCount} companies · {data.invoiceCount} invoices · {formatCurrency(data.grandTotal)} invoiced ·
          Generated {format(data.generatedAt, 'MMM d, yyyy')}
        </Text>

        {/* Header */}
        <View style={ovStyles.headerRow}>
          <Text style={ovStyles.colCompanyHdr}>Company</Text>
          {months.map((m) => <Text key={m} style={ovStyles.colMonthHdr}>{m.slice(0, 3)}</Text>)}
          <Text style={ovStyles.colTotalHdr}>Total</Text>
        </View>

        {/* Body */}
        {data.rows.map((row, i) => {
          const rowTotal = months.reduce((s, m) => s + (row.byMonth[m] ?? 0), 0);
          if (rowTotal === 0) return null; // skip companies with no invoices this year
          return (
            <View key={i} style={ovStyles.bodyRow}>
              <Text style={ovStyles.colCompany}>{row.companyName}</Text>
              {months.map((m) => (
                <Text key={m} style={ovStyles.colMonth}>
                  {(row.byMonth[m] ?? 0) > 0 ? formatCurrency(row.byMonth[m]) : '—'}
                </Text>
              ))}
              <Text style={ovStyles.colTotal}>{formatCurrency(rowTotal)}</Text>
            </View>
          );
        })}

        {/* Monthly totals */}
        <View style={ovStyles.totalsRow}>
          <Text style={[ovStyles.colCompany, ovStyles.totalCell]}>Monthly Total</Text>
          {months.map((m) => (
            <Text key={m} style={[ovStyles.colMonth, ovStyles.totalCell]}>{formatCurrency(data.monthTotals[m] ?? 0)}</Text>
          ))}
          <Text style={[ovStyles.colTotal, ovStyles.totalCell]}>{formatCurrency(data.grandTotal)}</Text>
        </View>

        <Text style={ovStyles.smallFooter} render={({ pageNumber, totalPages }) => `${SENDER.name} · ${data.year} Monthly Overview · Page ${pageNumber} of ${totalPages}`} fixed />
      </Page>
    </Document>
  );
}

export async function renderOverviewPDF(data: OverviewData): Promise<Buffer> {
  return renderToBuffer(<OverviewDoc data={data} />) as Promise<Buffer>;
}

// ─────────────────────────────────────────────────────────────────────────
// Invoices List PDF — exports the visible invoice table on the /invoices page.
// ─────────────────────────────────────────────────────────────────────────

const ilStyles = StyleSheet.create({
  page:        { fontFamily: 'Helvetica', fontSize: 9, padding: 30, color: '#111827', backgroundColor: '#ffffff' },
  title:       { fontFamily: 'Helvetica-Bold', fontSize: 18, color: '#4F46E5', marginBottom: 4 },
  subtitle:    { fontSize: 9, color: '#6B7280', marginBottom: 16 },

  tableHeader: { flexDirection: 'row', backgroundColor: '#F3F4F6', padding: '6 4', borderTopWidth: 1, borderTopColor: '#E5E7EB', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  row:         { flexDirection: 'row', padding: '6 4', borderBottomWidth: 0.5, borderBottomColor: '#F3F4F6' },

  hdrCell:     { fontFamily: 'Helvetica-Bold', fontSize: 7.5, textTransform: 'uppercase', color: '#6B7280' },
  cell:        { fontSize: 8.5, color: '#374151' },

  cInv:        { width: 50 },
  cCo:         { flex: 1.4 },
  cPeriod:     { width: 90 },
  cStatus:     { width: 70 },
  cDate:       { width: 70 },
  cAmt:        { width: 80, textAlign: 'right' },

  totalsRow:   { flexDirection: 'row', padding: '8 4', backgroundColor: '#EEF2FF', borderTopWidth: 1, borderTopColor: '#C7D2FE' },
  totalLbl:    { fontFamily: 'Helvetica-Bold', fontSize: 9, color: '#3730A3' },
  totalVal:    { fontFamily: 'Helvetica-Bold', fontSize: 9, color: '#3730A3', textAlign: 'right' },

  smallFooter: { position: 'absolute', bottom: 16, left: 30, right: 30, fontSize: 7, color: '#9CA3AF', textAlign: 'right' },
});

export interface InvoiceListRow {
  invoiceNumber: number;
  companyName:   string;
  month:         string;
  year:          number;
  status:        string;
  dateSent:      string;
  total:         number;
}

function InvoiceListDoc({ rows, filterLabel }: { rows: InvoiceListRow[]; filterLabel: string }) {
  const total = rows.reduce((s, r) => s + r.total, 0);
  const paid    = rows.filter(r => r.status === 'PAID').reduce((s, r) => s + r.total, 0);
  const pending = rows.filter(r => r.status === 'PENDING').reduce((s, r) => s + r.total, 0);
  const draft   = rows.filter(r => r.status === 'DRAFT').reduce((s, r) => s + r.total, 0);

  return (
    <Document>
      <Page size="LETTER" orientation="landscape" style={ilStyles.page}>
        <Text style={ilStyles.title}>Invoices Report</Text>
        <Text style={ilStyles.subtitle}>
          {filterLabel} · {rows.length} invoice{rows.length === 1 ? '' : 's'} · Total {formatCurrency(total)} (Paid {formatCurrency(paid)} · Pending {formatCurrency(pending)} · Draft {formatCurrency(draft)}) · Generated {format(new Date(), 'MMM d, yyyy')}
        </Text>

        {/* Header */}
        <View style={ilStyles.tableHeader}>
          <Text style={[ilStyles.hdrCell, ilStyles.cInv]}>Inv #</Text>
          <Text style={[ilStyles.hdrCell, ilStyles.cCo]}>Company</Text>
          <Text style={[ilStyles.hdrCell, ilStyles.cPeriod]}>Period</Text>
          <Text style={[ilStyles.hdrCell, ilStyles.cStatus]}>Status</Text>
          <Text style={[ilStyles.hdrCell, ilStyles.cDate]}>Date Sent</Text>
          <Text style={[ilStyles.hdrCell, ilStyles.cAmt]}>Total</Text>
        </View>

        {/* Rows */}
        {rows.map((r, i) => (
          <View key={i} style={ilStyles.row}>
            <Text style={[ilStyles.cell, ilStyles.cInv]}>#{r.invoiceNumber}</Text>
            <Text style={[ilStyles.cell, ilStyles.cCo]}>{r.companyName}</Text>
            <Text style={[ilStyles.cell, ilStyles.cPeriod]}>{r.month} {r.year}</Text>
            <Text style={[ilStyles.cell, ilStyles.cStatus]}>{r.status}</Text>
            <Text style={[ilStyles.cell, ilStyles.cDate]}>{r.dateSent || '—'}</Text>
            <Text style={[ilStyles.cell, ilStyles.cAmt]}>{formatCurrency(r.total)}</Text>
          </View>
        ))}

        {/* Total row */}
        <View style={ilStyles.totalsRow}>
          <Text style={[ilStyles.totalLbl, ilStyles.cInv]}> </Text>
          <Text style={[ilStyles.totalLbl, ilStyles.cCo]}>TOTAL</Text>
          <Text style={[ilStyles.totalLbl, ilStyles.cPeriod]}> </Text>
          <Text style={[ilStyles.totalLbl, ilStyles.cStatus]}> </Text>
          <Text style={[ilStyles.totalLbl, ilStyles.cDate]}> </Text>
          <Text style={[ilStyles.totalVal, ilStyles.cAmt]}>{formatCurrency(total)}</Text>
        </View>

        <Text style={ilStyles.smallFooter} render={({ pageNumber, totalPages }) => `${SENDER.name} · Invoices Report · Page ${pageNumber} of ${totalPages}`} fixed />
      </Page>
    </Document>
  );
}

export async function renderInvoiceListPDF(rows: InvoiceListRow[], filterLabel: string): Promise<Buffer> {
  return renderToBuffer(<InvoiceListDoc rows={rows} filterLabel={filterLabel} />) as Promise<Buffer>;
}
