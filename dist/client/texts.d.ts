import type { Lang } from "../core/types";
/** Message ids shared by the widgets and the contact modal. */
export type TextKey = "contact" | "contactHint" | "kicker" | "modalTitle" | "welcome" | "scanHint" | "mobileHint" | "close" | "copyHint" | "copied" | "expired" | "fallback" | "plugins" | "contactTip" | "starTip" | "issueTip" | "starLabel" | "issueLabel" | "actionsLabel" | "moreActions" | "channelFeishu" | "channelQq" | "channelWechat";
export type TextOverrides = Partial<Record<string, string>>;
/**
 * Built-in copy. The wording mirrors the README contact block so the settings
 * panel and the README read the same; callers can override any message id.
 */
export declare const MESSAGES: Record<Lang, Record<TextKey, string>>;
/** Resolve one message id: caller overrides win, then the detected language. */
export declare function resolveText(key: TextKey, lang: Lang, overrides?: TextOverrides): string;
