"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle } from "lucide-react";
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

interface CompleteSRDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    srId: string;
    srNumber: string;
}

export function CompleteSRDialog({
    open,
    onOpenChange,
    srId,
    srNumber,
}: CompleteSRDialogProps) {
    const [resolutionDescription, setResolutionDescription] = useState("");
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();
    const router = useRouter();
    const queryClient = useQueryClient();

    const handleComplete = async (e?: React.FormEvent) => {
        if (e) {
            e.preventDefault();
        }

        if (!resolutionDescription.trim()) {
            toast({
                title: "오류",
                description: "해결 내용을 입력해주세요.",
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
                    action: "complete",
                    resolutionDescription: resolutionDescription.trim(),
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || "상태 변경에 실패했습니다.");
            }

            toast({
                title: "성공",
                description: "SR이 완료 처리되었습니다.",
            });

            setResolutionDescription("");
            onOpenChange(false);

            // React Query 캐시 무효화
            await queryClient.invalidateQueries({ queryKey: ["sr", srId] });

            // SR 목록으로 이동
            // SR 목록으로 이동
            router.refresh();
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
                        <CheckCircle className="h-5 w-5 text-green-600" />
                        SR 완료 처리
                    </DialogTitle>
                    <DialogDescription>
                        {srNumber} - SR을 완료 처리합니다. 해결 내용을 입력해주세요.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleComplete}>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="resolution">
                                해결 내용 <span className="text-destructive">*</span>
                            </Label>
                            <Textarea
                                id="resolution"
                                placeholder="어떻게 해결했는지 상세히 기록해주세요..."
                                className="min-h-[120px]"
                                value={resolutionDescription}
                                onChange={(e) => setResolutionDescription(e.target.value)}
                                disabled={loading}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && e.ctrlKey) {
                                        handleComplete();
                                    }
                                }}
                            />
                            <p className="text-sm text-muted-foreground">
                                신청자가 확인할 수 있는 내용입니다. (Ctrl+Enter로 저장)
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
                        <Button type="submit" disabled={loading}>
                            {loading ? "처리 중..." : "완료 처리"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
