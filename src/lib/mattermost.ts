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
    // 환경 변수에서 숨겨진 공백/특수문자 제거
    const webhookUrl = process.env.MATTERMOST_WEBHOOK_URL?.trim();
    const targetChannel = channel || process.env.MATTERMOST_CHANNEL?.trim();

    console.log(`[Mattermost] Sending notification to channel: ${targetChannel || 'Default (Webhook Config)'}`);

    if (!webhookUrl) {
        logger.warn("[Mattermost] MATTERMOST_WEBHOOK_URL is not defined. Notification skipped.");
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
        const response = await fetch(webhookUrl, {
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
