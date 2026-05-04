export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

// Auto-extends every year so no one has to update this by hand.
// Runs from the earliest data we track (2023) through next year.
export const YEARS: readonly number[] = (() => {
  const endYear = new Date().getFullYear() + 1;
  const years: number[] = [];
  for (let y = 2023; y <= endYear; y++) years.push(y);
  return years;
})();

export const SENDER = {
  name: '17116039 Canada Inc',
  address: '41C Father Costello Drive',
  city: 'Timmins ON P0N 1G0',
  phone: '+1 (705) 951-1364',
  // `email` is the functional billing / replies address (footer + SMTP).
  // `headerEmail` is what prints at the top of the invoice header — Yash
  // wants his personal address displayed there so customers contact him
  // directly for account questions, while accountspayable@ stays the
  // billing mailbox in the footer.
  email:       'accountspayable@vetstaxi.ca',
  headerEmail: 'yashkalola@vetstaxi.ca',
  hst:         '787334432RT0001',
  poNumber:    '842',
} as const;

export const BANKING = {
  branch:      '25582',
  institution: '001',
  account:     '1974380',
} as const;

export const INVOICE_NUMBER_SEED = 1593;
