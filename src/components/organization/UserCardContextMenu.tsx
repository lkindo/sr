"use client";

import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Edit, Eye, Power } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";

interface UserCardContextMenuProps {
    userId: string;
    userName: string;
    isActive: boolean;
    children: React.ReactNode;
    onToggleStatus?: (userId: string) => Promise<void>;
}

export function UserCardContextMenu({
    userId,
    userName,
    isActive,
    children,
    onToggleStatus,
}: UserCardContextMenuProps) {
    const router = useRouter();
    const { toast } = useToast();

    const handleEdit = () => {
        router.push(`/users/${userId}`);
    };

    const handleView = () => {
        router.push(`/users/${userId}`);
    };

    const handleToggleStatus = async () => {
        if (!onToggleStatus) {
            toast({
                title: "오류",
                description: "상태 변경 기능을 사용할 수 없습니다.",
                variant: "destructive",
            });
            return;
        }

        try {
            await onToggleStatus(userId);
            toast({
                title: "성공",
                description: `${userName}이(가) ${isActive ? "비활성화" : "활성화"}되었습니다.`,
            });
        } catch {
            toast({
                title: "오류",
                description: "상태 변경 중 오류가 발생했습니다.",
                variant: "destructive",
            });
        }
    };

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                {children}
            </ContextMenuTrigger>
            <ContextMenuContent className="w-48">
                <ContextMenuItem onClick={handleView} className="cursor-pointer">
                    <Eye className="mr-2 h-4 w-4" />
                    상세보기
                </ContextMenuItem>
                <ContextMenuItem onClick={handleEdit} className="cursor-pointer">
                    <Edit className="mr-2 h-4 w-4" />
                    수정
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                    onClick={handleToggleStatus}
                    className="cursor-pointer"
                    disabled={!onToggleStatus}
                >
                    <Power className="mr-2 h-4 w-4" />
                    {isActive ? "비활성화" : "활성화"}
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}
