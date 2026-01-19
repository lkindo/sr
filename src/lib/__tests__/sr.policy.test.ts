import { describe, expect, it } from 'vitest';

import {
  canCreateSR,
  canDeleteSR,
  canReadSR,
  canUpdateSR,
  ensureCanCreateSR,
  ensureCanDeleteSR,
  ensureCanReadSR,
  ensureCanUpdateSR,
} from '@/lib/policies';

const baseSR = {
  id: 'sr-1',
  requesterId: 'user-1',
  status: 'REQUESTED',
  clientId: 'client-1',
} as any;

const admin = {
  id: 'admin',
  roles: ['ADMIN'],
  permissions: ['SR:CREATE', 'SR:READ', 'SR:UPDATE', 'SR:DELETE'],
  permissionsGrantedAt: {},
  clientIds: ['client-1'],
} as any;
const requester = {
  id: 'user-1',
  roles: [],
  permissions: ['SR:CREATE', 'SR:UPDATE_SELF'],
  permissionsGrantedAt: {},
  clientIds: ['client-1'],
} as any;

const noPerm = {
  id: 'user-2',
  roles: [],
  permissions: [],
  permissionsGrantedAt: {},
  clientIds: ['client-1'],
} as any;

describe('SR Policy Functions', () => {
  it('관리자는 모든 권한을 가진다', () => {
    expect(canCreateSR(admin)).toBe(true);
    expect(canReadSR(admin, baseSR)).toBe(true);
    expect(canUpdateSR(admin, baseSR)).toBe(true);
    expect(canDeleteSR(admin)).toBe(true);
  });

  it('요청자는 자신이 요청한 SR을 읽고 self-update할 수 있다', () => {
    expect(canReadSR(requester, baseSR)).toBe(true);
    expect(canUpdateSR(requester, baseSR)).toBe(true);
    expect(canDeleteSR(requester)).toBe(false);
  });

  it('권한 없는 사용자는 거부된다', () => {
    expect(canCreateSR(noPerm)).toBe(false);
    expect(canReadSR(noPerm, baseSR)).toBe(false);
    expect(canUpdateSR(noPerm, baseSR)).toBe(false);
    expect(canDeleteSR(noPerm)).toBe(false);
  });

  it('ensure 함수는 권한 없을 때 예외를 던진다', () => {
    expect(() => ensureCanCreateSR(noPerm)).toThrowError(/생성/);
    expect(() => ensureCanReadSR(noPerm, baseSR)).toThrowError(/조회/);
    expect(() => ensureCanUpdateSR(noPerm, baseSR)).toThrowError(/수정/);
    expect(() => ensureCanDeleteSR(noPerm)).toThrowError(/삭제/);
  });
});
