import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface User {
    id: string;
    name: string;
}

interface DeleteUserDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    user: User | null;
    onDelete: (userId: string) => Promise<void>;
}

export function DeleteUserDialog({
    open,
    onOpenChange,
    user,
    onDelete,
}: DeleteUserDialogProps) {
    const [loading, setLoading] = useState(false);

    const handleDelete = async () => {
        if (!user) return;
        console.log('[DeleteUserDialog] Starting delete for user:', user.id, user.name);
        setLoading(true);
        try {
            console.log('[DeleteUserDialog] Calling onDelete...');
            await onDelete(user.id);
            console.log('[DeleteUserDialog] onDelete completed successfully');
            // 성공 시에만 다이얼로그 닫기 (부모에서 토스트 표시 후)
            setTimeout(() => {
                console.log('[DeleteUserDialog] Closing dialog');
                onOpenChange(false);
            }, 100);
        } catch (error) {
            // 에러를 다시 throw하지 않고, 부모에서 이미 처리됨
            console.error("[DeleteUserDialog] Error caught:", error);
            // 에러 발생 시 다이얼로그는 열린 상태 유지
        } finally {
            console.log('[DeleteUserDialog] Setting loading to false');
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>사용자 삭제</DialogTitle>
                    <DialogDescription>
                        정말로 <strong>{user?.name}</strong> 사용자를 삭제하시겠습니까?
                        <br />이 작업은 되돌릴 수 없습니다.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                        취소
                    </Button>
                    <Button variant="destructive" onClick={handleDelete} disabled={loading}>
                        {loading ? "삭제 중..." : "삭제"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
