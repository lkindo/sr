"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background text-foreground">
            <div className="flex flex-col items-center gap-2 text-center">
                <AlertCircle className="h-10 w-10 text-destructive" />
                <h2 className="text-2xl font-bold tracking-tight">문제가 발생했습니다</h2>
                <p className="text-muted-foreground">
                    요청을 처리하는 도중 예기치 않은 오류가 발생했습니다.
                </p>
            </div>
            <Button onClick={() => reset()}>다시 시도</Button>
        </div>
    );
}
