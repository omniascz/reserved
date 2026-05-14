import { describe, expect, it } from 'vitest';
import {
  AddMemberSchema,
  CreateCorporateAccountSchema,
  UpdateMemberSchema,
} from '../dto/corporate-account.dto.js';

const UUID_A = '123e4567-e89b-12d3-a456-426614174000';

describe('CreateCorporateAccountSchema', () => {
  it('accepts valid minimal input (jen companyName)', () => {
    const result = CreateCorporateAccountSchema.safeParse({ companyName: 'Acme s.r.o.' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.billingCountry).toBe('CZ');
      expect(result.data.isActive).toBe(true);
      expect(result.data.vatId).toBeUndefined();
    }
  });

  it('accepts full data', () => {
    const result = CreateCorporateAccountSchema.safeParse({
      companyName: 'Acme s.r.o.',
      vatId: 'CZ12345678',
      companyRegId: '12345678',
      billingAddressLine1: 'Náměstí 1',
      billingCity: 'Praha',
      billingZip: '110 00',
      billingCountry: 'CZ',
      contactEmail: 'fakturace@acme.cz',
      contactPhone: '+420 123 456 789',
      contactPersonName: 'Jan Novák',
      note: 'VIP klient',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty company name', () => {
    const result = CreateCorporateAccountSchema.safeParse({ companyName: '' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid VAT ID format', () => {
    const result = CreateCorporateAccountSchema.safeParse({
      companyName: 'X',
      vatId: '12345',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = CreateCorporateAccountSchema.safeParse({
      companyName: 'X',
      contactEmail: 'not-email',
    });
    expect(result.success).toBe(false);
  });

  it('rejects 3-pismenny country code', () => {
    const result = CreateCorporateAccountSchema.safeParse({
      companyName: 'X',
      billingCountry: 'CZE',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid companyRegId (pismena)', () => {
    const result = CreateCorporateAccountSchema.safeParse({
      companyName: 'X',
      companyRegId: 'AB12',
    });
    expect(result.success).toBe(false);
  });

  it('accepts null pro vse co je optional', () => {
    const result = CreateCorporateAccountSchema.safeParse({
      companyName: 'X',
      vatId: null,
      companyRegId: null,
      billingAddressLine1: null,
      contactEmail: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('AddMemberSchema', () => {
  it('accepts valid customerId + default role', () => {
    const result = AddMemberSchema.safeParse({ customerId: UUID_A });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.role).toBe('member');
  });

  it('accepts admin role', () => {
    const result = AddMemberSchema.safeParse({ customerId: UUID_A, role: 'admin' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid role', () => {
    const result = AddMemberSchema.safeParse({ customerId: UUID_A, role: 'owner' });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID customerId', () => {
    const result = AddMemberSchema.safeParse({ customerId: 'not-uuid' });
    expect(result.success).toBe(false);
  });
});

describe('UpdateMemberSchema', () => {
  it('requires role', () => {
    const result = UpdateMemberSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts role change', () => {
    const result = UpdateMemberSchema.safeParse({ role: 'admin' });
    expect(result.success).toBe(true);
  });
});
