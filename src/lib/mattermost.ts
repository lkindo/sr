import { logger } from "@/lib/logger";

interface MattermostAttachment {
    color?: string;
    text?: string;
    title?: string;
    fields?: Array<{
        short: boolean;
        title: string;
        value: string;
    }>;
    title_link?: string;
    actions?: Array<{
        name: string;
        integration: {
            url: string;
            context: Record<string, any>;
        };
    }>;
}

interface MattermostMessage {
    channel?: string;
    username?: string;
    icon_url?: string;
    text: string;
    attachments?: MattermostAttachment[];
}

export const sendMattermostNotification = async (
    message: string,
    attachments: MattermostAttachment[] = [],
    channel?: string
): Promise<void> => {
    // 환경 변수에서 모든 제어 문자, 보이지 않는 문자, 공백, 따옴표 제거
    const rawUrl = process.env.MATTERMOST_WEBHOOK_URL || '';
    // 모든 공백류 문자, 따옴표 제거 (Vercel 환경 변수에 따옴표가 포함될 수 있음)
    const webhookUrl = rawUrl.replace(/[\s\u0000-\u001F\u007F-\u009F\uFEFF\u200B-\u200D"'`]/g, '');
    const targetChannel = channel || process.env.MATTERMOST_CHANNEL?.trim();

    console.log(`[Mattermost] Sending notification to channel: ${targetChannel || 'Default (Webhook Config)'}`);
    console.log(`[Mattermost] Webhook URL length: ${webhookUrl.length}, raw length: ${rawUrl.length}`);

    if (!webhookUrl) {
        logger.warn("[Mattermost] MATTERMOST_WEBHOOK_URL is not defined. Notification skipped.");
        return;
    }

    // URL 유효성 검사
    let validatedUrl: URL;
    try {
        validatedUrl = new URL(webhookUrl);
        console.log(`[Mattermost] Validated URL: ${validatedUrl.href}`);
    } catch (urlError) {
        logger.error(`[Mattermost] Invalid webhook URL: "${webhookUrl}"`, urlError instanceof Error ? urlError : undefined);
        console.log(`[Mattermost] URL char codes:`, [...webhookUrl].map(c => c.charCodeAt(0)));
        return;
    }

    const payload: MattermostMessage = {
        username: "SR System",
        text: message,
        attachments,
    };

    if (targetChannel) {
        payload.channel = targetChannel;
    }

    try {
        console.log(`[Mattermost] Payload:`, JSON.stringify(payload, null, 2));
        const response = await fetch(validatedUrl.href, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error(`[Mattermost] Failed to send notification: ${response.status} ${response.statusText}`, undefined, {
                response: errorText,
            });
        } else {
            console.log(`[Mattermost] Notification sent successfully. Status: ${response.status}`);
        }
    } catch (error) {
        logger.error("[Mattermost] Error sending notification", error instanceof Error ? error : new Error(String(error)));
    }
};
