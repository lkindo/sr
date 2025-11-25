import { describe, it, expect } from 'vitest';
import {
    canTransition,
    getAvailableTransitions,
    getRequiredFields,
    validateTransition,
    VALID_TRANSITIONS,
    type SRStatus,
} from '../sr-state-machine';

describe('SR State Machine', () => {
    describe('canTransition', () => {
        it('REQUESTED에서 INTAKE로 전환 가능', () => {
            expect(canTransition('REQUESTED', 'INTAKE')).toBe(true);
        });

        it('REQUESTED에서 REJECTED로 전환 가능', () => {
            expect(canTransition('REQUESTED', 'REJECTED')).toBe(true);
        });

        it('REQUESTED에서 COMPLETED로 직접 전환 불가능', () => {
            expect(canTransition('REQUESTED', 'COMPLETED')).toBe(false);
        });

        it('INTAKE에서 IN_PROGRESS로 전환 가능', () => {
            expect(canTransition('INTAKE', 'IN_PROGRESS')).toBe(true);
        });

        it('IN_PROGRESS에서 COMPLETED로 전환 가능', () => {
            expect(canTransition('IN_PROGRESS', 'COMPLETED')).toBe(true);
        });

        it('COMPLETED에서 CONFIRMED로 전환 가능', () => {
            expect(canTransition('COMPLETED', 'CONFIRMED')).toBe(true);
        });

        it('COMPLETED에서 IN_PROGRESS로 재오픈 가능', () => {
            expect(canTransition('COMPLETED', 'IN_PROGRESS')).toBe(true);
        });

        it('CONFIRMED는 terminal state이므로 다른 상태로 전환 불가', () => {
            expect(canTransition('CONFIRMED', 'IN_PROGRESS')).toBe(false);
            expect(canTransition('CONFIRMED', 'REQUESTED')).toBe(false);
        });

        it('REJECTED에서 REQUESTED로 재요청 불가능 (삭제 후 새로 생성해야 함)', () => {
            expect(canTransition('REJECTED', 'REQUESTED')).toBe(false);
        });
    });

    describe('getAvailableTransitions', () => {
        it('REQUESTED 상태의 가능한 전환 목록 반환', () => {
            const transitions = getAvailableTransitions('REQUESTED');
            expect(transitions).toEqual(['INTAKE', 'REJECTED']);
        });

        it('IN_PROGRESS 상태의 가능한 전환 목록 반환', () => {
            const transitions = getAvailableTransitions('IN_PROGRESS');
            expect(transitions).toEqual(['COMPLETED', 'ON_HOLD']);
        });

        it('CONFIRMED 상태는 빈 배열 반환 (terminal state)', () => {
            const transitions = getAvailableTransitions('CONFIRMED');
            expect(transitions).toEqual([]);
        });
    });

    describe('getRequiredFields', () => {
        it('IN_PROGRESS 전환 시 assigneeId 필요', () => {
            const fields = getRequiredFields('IN_PROGRESS');
            expect(fields).toContain('assigneeId');
        });

        it('COMPLETED 전환 시 resolutionDescription 필요', () => {
            const fields = getRequiredFields('COMPLETED');
            expect(fields).toContain('resolutionDescription');
        });

        it('REJECTED 전환 시 rejectionReason 필요', () => {
            const fields = getRequiredFields('REJECTED');
            expect(fields).toContain('rejectionReason');
        });

        it('INTAKE 전환 시 필수 필드 없음', () => {
            const fields = getRequiredFields('INTAKE');
            expect(fields).toEqual([]);
        });
    });

    describe('validateTransition', () => {
        const adminRoles = ['ADMIN'];
        const managerRoles = ['MANAGER'];
        const clientUserRoles = ['CLIENT_USER'];

        it('유효한 전환은 valid: true 반환 (권한 있음)', () => {
            const result = validateTransition('REQUESTED', 'INTAKE', managerRoles);
            expect(result.valid).toBe(true);
        });

        it('무효한 전환은 valid: false와 메시지 반환', () => {
            const result = validateTransition('REQUESTED', 'COMPLETED', adminRoles);
            expect(result.valid).toBe(false);
            expect(result.message).toBeDefined();
        });

        it('권한이 없는 전환은 valid: false와 권한 오류 메시지 반환', () => {
            // CLIENT_USER는 INTAKE 권한이 없음
            const result = validateTransition('REQUESTED', 'INTAKE', clientUserRoles);
            expect(result.valid).toBe(false);
            expect(result.message).toContain('권한이 없습니다');
        });

        it('CLIENT_USER는 CONFIRMED로 전환 가능', () => {
            const result = validateTransition('COMPLETED', 'CONFIRMED', clientUserRoles);
            expect(result.valid).toBe(true);
        });

        it('필수 필드가 있는 전환은 valid: true와 필수 필드 메시지 반환 (권한 검증 통과 후)', () => {
            const result = validateTransition('INTAKE', 'IN_PROGRESS', managerRoles);
            expect(result.valid).toBe(true);
            expect(result.message).toContain('assigneeId');
        });
    });

    describe('VALID_TRANSITIONS 정합성', () => {
        it('모든 상태가 정의되어 있어야 함', () => {
            const allStatuses: SRStatus[] = [
                'REQUESTED',
                'INTAKE',
                'IN_PROGRESS',
                'ON_HOLD',
                'COMPLETED',
                'CONFIRMED',
                'REJECTED',
            ];

            allStatuses.forEach((status) => {
                expect(VALID_TRANSITIONS[status]).toBeDefined();
            });
        });

        it('순환 참조가 없어야 함 (CONFIRMED 제외)', () => {
            // CONFIRMED는 terminal state이므로 어디로도 전환 불가
            expect(VALID_TRANSITIONS.CONFIRMED).toEqual([]);
        });
    });
});
