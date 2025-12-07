import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { pushService } from "@/services/push.service";

// Force refresh: 2025-12-07
export async function POST(req: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // 구독 정보 확인
        const subscriptions = await pushService.getUserSubscriptions(session.user.id);
        console.log(`[Test API] Found ${subscriptions.length} subscriptions for user ${session.user.id}`);

        if (subscriptions.length === 0) {
            return NextResponse.json({ error: "No subscriptions found. Please enable push notifications in settings." }, { status: 404 });
        }

        // 본인에게 테스트 알림 전송
        const results = await pushService.sendToUser(session.user.id, {
            title: "테스트 알림",
            body: "웹 푸시 알림이 정상적으로 작동합니다!",
            url: "/dashboard",
            tag: "test-notification"
        });

        console.log("[Test API] Send results:", results);
        return NextResponse.json({ success: true, count: subscriptions.length, results });
    } catch (error) {
        console.error("Test push failed:", error);
        return NextResponse.json({ error: "Failed to send test push" }, { status: 500 });
    }
}
