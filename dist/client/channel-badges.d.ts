import type { TextKey } from "./texts";
/**
 * Official channel marks for the contact modal's group cards.
 *
 * One channel = one row in `CHANNEL_BADGES`: the official brand colour plus the
 * official mark's own viewBox and paths. Adding a channel is a data change here,
 * never a renderer change — the card title renders whatever row the group's
 * `platform` points at, and a platform without a row renders no badge.
 *
 * Channel names are message ids ({@link TextKey}), so hosts can override them
 * through the same `texts` option as every other string.
 *
 * The marks identify the platform only (the brand policies allow that); each
 * mark stays the trademark of its owner:
 *   - feishu: Lark/Feishu mark (ByteDance IconPark `lark`), brand blue #3370FF
 *   - qq: Tencent QQ penguin (Simple Icons `tencentqq`), brand blue #12B7F5
 *   - wechat: WeChat bubbles (Simple Icons `wechat`), brand green #07C160
 */
export interface ChannelBadgeSpec {
    /** Platform id the group's `platform` field points at. */
    platform: string;
    /** Message id of the channel name read by assistive tech before the title. */
    labelKey: TextKey;
    /** Official brand colour of the badge tile; the mark is painted white on it. */
    color: string;
    /** Coordinate system of the mark's own paths. */
    viewBox: string;
    /** Mark paths, filled with `currentColor` (the badge sets white). */
    paths: readonly string[];
    /** Marks with counters/holes need evenodd; single-winding marks stay nonzero. */
    fillRule: "evenodd" | "nonzero";
}
/** Look up a channel mark; a platform without a row renders no badge. */
export declare function channelBadge(platform: string): ChannelBadgeSpec | undefined;
/**
 * Build the decorative badge from a table row: brand-coloured tile (colour via
 * the `--dsh-base-badge-color` custom property, sized by CSS) + white mark.
 * The caller already looked the row up, so this never fails.
 */
export declare function createChannelBadge(doc: Document, badge: ChannelBadgeSpec): HTMLSpanElement;
