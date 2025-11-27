"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { XCircle } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface RejectSRDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    srId: string;
    srNumber: string;
}

export function RejectSRDialog({
    open,
    onOpenChange,
    srId,
    srNumber,
}: RejectSRDialogProps) {
    const [reason, setReason] = useState("");
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();
    const router = useRouter();
    const queryClient = useQueryClient();

    const handleReject = async (e?: React.FormEvent) => {
        if (e) {
            e.preventDefault();
        }

        if (!reason.trim()) {
            toast({
                title: "오류",
                description: "거절 사유를 입력해주세요.",
                variant: "destructive",
            });
            return;
        }

        setLoading(true);

        try {
            const response = await fetch(`/api/srs/${srId}/status`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    action: "reject",
                    reason: reason.trim(),
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || "상태 변경에 실패했습니다.");
            }

            toast({
                title: "성공",
                description: "SR이 거절 처리되었습니다.",
            });

            setReason("");
            onOpenChange(false);

            // React Query 캐시 무효화
            await queryClient.invalidateQueries({ queryKey: ["sr", srId] });

            // SR 목록으로 이동
            router.push("/srs");
        } catch (error) {
            toast({
                title: "오류",
                description:
                    error instanceof Error ? error.message : "상태 변경에 실패했습니다.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[525px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <XCircle className="h-5 w-5 text-red-600" />
                        SR 거절 처리
                    </DialogTitle>
                    <DialogDescription>
                        {srNumber} - SR을 거절합니다. 거절 사유를 입력해주세요.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleReject}>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="reason">
                                거절 사유 <span className="text-destructive">*</span>
                            </Label>
                            <Textarea
                                id="reason"
                                placeholder="거절 사유를 명확히 기입해주세요..."
                                className="min-h-[100px]"
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                disabled={loading}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && e.ctrlKey) {
                                        handleReject();
                                    }
                                }}
                            />
                            <p className="text-sm text-muted-foreground">
                                신청자에게 거절 사유가 전달됩니다. (Ctrl+Enter로 저장)
                            </p>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={loading}
                        >
                            취소
                        </Button>
                        <Button type="submit" disabled={loading} variant="destructive">
                            {loading ? "처리 중..." : "거절 처리"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
