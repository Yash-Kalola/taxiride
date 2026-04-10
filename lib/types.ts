import type { Company, Ride, Invoice, InvoiceStatus } from '@prisma/client';

// Re-export Prisma model types as the canonical types
export type { Company, Ride, Invoice, InvoiceStatus };

// Extended types with relations included
export type CompanyWithCounts = Company & {
  _count: { rides: number; invoices: number };
};

export type InvoiceWithCompany = Invoice & {
  company: Pick<Company, 'companyName' | 'accountId' | 'address' | 'poNumber' | 'email'>;
  rides: Ride[];
};

export type RideWithCompany = Ride & {
  company: Pick<Company, 'companyName' | 'accountId'>;
};

// API payload types
export interface GenerateInvoicePayload {
  companyId: string;
  month: string;
  year: number;
}

export interface ImportRidesPayload {
  companyId: string;
  month: string;
  year: number;
  rows: Array<{
    jobId?: string;
    vehicleNumber?: string;
    pickupLocation?: string;
    dropoffLocation?: string;
    passenger?: string;
    driver?: string;
    dateTime?: string;
    amount: number;
  }>;
}
