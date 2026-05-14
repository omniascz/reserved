import { describe, expect, it } from 'vitest';
import { ToggleFeatureFlagSchema, UpsertFeatureFlagSchema } from '../dto/feature-flag.dto.js';

describe('UpsertFeatureFlagSchema', () => {
  it('accepts valid simple flag', () => {
    const result = UpsertFeatureFlagSchema.safeParse({
      key: 'subscriptions_enabled',
      isEnabled: true,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.config).toEqual({});
  });

  it('accepts namespaced key with colon', () => {
    const result = UpsertFeatureFlagSchema.safeParse({
      key: 'beta:google_calendar_sync',
      isEnabled: false,
    });
    expect(result.success).toBe(true);
  });

  it('accepts multi-level namespace', () => {
    const result = UpsertFeatureFlagSchema.safeParse({
      key: 'package_visibility:vip_bundle',
      isEnabled: true,
      config: { requiredTags: ['VIP'] },
    });
    expect(result.success).toBe(true);
  });

  it('rejects uppercase key', () => {
    const result = UpsertFeatureFlagSchema.safeParse({
      key: 'Subscriptions_Enabled',
      isEnabled: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects key with dash', () => {
    const result = UpsertFeatureFlagSchema.safeParse({
      key: 'subscriptions-enabled',
      isEnabled: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects key starting with digit', () => {
    const result = UpsertFeatureFlagSchema.safeParse({
      key: '1_enabled',
      isEnabled: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty key', () => {
    const result = UpsertFeatureFlagSchema.safeParse({
      key: '',
      isEnabled: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects key > 100 znaku', () => {
    const result = UpsertFeatureFlagSchema.safeParse({
      key: 'a'.repeat(101),
      isEnabled: true,
    });
    expect(result.success).toBe(false);
  });

  it('accepts description + config', () => {
    const result = UpsertFeatureFlagSchema.safeParse({
      key: 'experimental_calendar_v2',
      description: 'Beta verze kalendare s drag-drop',
      isEnabled: true,
      config: { percentageRollout: 50 },
    });
    expect(result.success).toBe(true);
  });

  it('accepts description null', () => {
    const result = UpsertFeatureFlagSchema.safeParse({
      key: 'test_flag',
      description: null,
      isEnabled: true,
    });
    expect(result.success).toBe(true);
  });
});

describe('ToggleFeatureFlagSchema', () => {
  it('accepts isEnabled true', () => {
    const result = ToggleFeatureFlagSchema.safeParse({ isEnabled: true });
    expect(result.success).toBe(true);
  });

  it('accepts isEnabled false', () => {
    const result = ToggleFeatureFlagSchema.safeParse({ isEnabled: false });
    expect(result.success).toBe(true);
  });

  it('requires isEnabled', () => {
    const result = ToggleFeatureFlagSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
