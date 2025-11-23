"use client";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface UserReassignDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    userName: string;
    sourceClientName: string;
    targetClientName: string;
    onConfirm: () => void;
}

export function UserReassignDialog({
    open,
    onOpenChange,
    userName,
    sourceClientName,
    targetClientName,
    onConfirm,
}: UserReassignDialogProps) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>사용자 소속 변경</AlertDialogTitle>
                    <AlertDialogDescription className="space-y-2">
                        <p>
                            <strong>{userName}</strong> 사용자의 소속을 변경하시겠습니까?
                        </p>
                        <div className="text-sm bg-muted p-3 rounded-md space-y-1">
                            <p>
                                <span className="text-muted-foreground">현재:</span>{" "}
                                <strong>{sourceClientName}</strong>
                            </p>
                            <p>
                                <span className="text-muted-foreground">변경:</span>{" "}
                                <strong className="text-primary">{targetClientName}</strong>
                            </p>
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>취소</AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm}>확인</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
