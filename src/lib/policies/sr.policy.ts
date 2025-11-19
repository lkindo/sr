import { SR, SRStatus } from "@prisma/client";
import { AuthenticatedUser } from "@/types/session";
import { ForbiddenError } from "@/lib/errors";

export class SRPolicy {
    /**
     * SR 생성 권한 확인
     * - 기본적으로 인증된 사용자는 생성 가능 (하지만 상위 레이어에서 SR:CREATE 권한 체크 권장)
     */
    canCreate(user: AuthenticatedUser): boolean {
        return !!user;
    }

    /**
     * SR 조회 권한 확인
     * - 현재는 모든 인증된 사용자가 조회 가능
     * - 추후 테넌트/클라이언트 격리 시 로직 추가
     */
    canRead(user: AuthenticatedUser, sr: SR): boolean {
        return !!user;
    }

    /**
     * SR 수정 권한 확인
     * - ADMIN: 모든 상태에서 수정 가능
     * - 요청자: REQUESTED 상태에서만 수정 가능
     * - 그 외: 수정 불가
     */
    canUpdate(user: AuthenticatedUser, sr: SR): boolean {
        const isAdmin = user.roles.includes("ADMIN");
        const isRequester = sr.requesterId === user.id;

        if (sr.status === "REQUESTED") {
            return isAdmin || isRequester;
        }

        return isAdmin;
    }

    /**
     * SR 삭제 권한 확인
     * - ADMIN만 삭제 가능
     */
    canDelete(user: AuthenticatedUser, sr: SR): boolean {
        return user.roles.includes("ADMIN");
    }

    // --- Enforce Methods (Throw Error) ---

    ensureCanCreate(user: AuthenticatedUser): void {
        if (!this.canCreate(user)) {
            throw new ForbiddenError("SR 생성 권한이 없습니다.");
        }
    }

    ensureCanRead(user: AuthenticatedUser, sr: SR): void {
        if (!this.canRead(user, sr)) {
            throw new ForbiddenError("SR 조회 권한이 없습니다.");
        }
    }

    ensureCanUpdate(user: AuthenticatedUser, sr: SR): void {
        if (!this.canUpdate(user, sr)) {
            if (sr.status === "REQUESTED") {
                throw new ForbiddenError("SR 수정 권한이 없습니다. 요청자 또는 관리자만 수정할 수 있습니다.");
            } else {
                throw new ForbiddenError("SR 수정 권한이 없습니다. 관리자만 수정할 수 있습니다.");
            }
        }
    }

    ensureCanDelete(user: AuthenticatedUser, sr: SR): void {
        if (!this.canDelete(user, sr)) {
            throw new ForbiddenError("SR 삭제 권한이 없습니다. 관리자만 삭제할 수 있습니다.");
        }
    }
}
