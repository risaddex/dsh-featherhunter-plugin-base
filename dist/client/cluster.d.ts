import type * as ReactNamespace from "react";
import type { TextKey } from "./texts";
import type { ActionClusterProps } from "./types";
/** Everything the cluster needs from the host-agnostic base context. */
export interface ActionClusterDeps {
    text: (key: TextKey) => string;
    openContact: (trigger: HTMLElement | null) => void;
    /** Star target: the host repository. Missing means no Star entry. */
    repoUrl?: string;
    /** Issue target; when omitted the issue list of repoUrl is used. */
    issuesUrl?: string;
}
/**
 * Build the header action cluster bound to the injected React runtime.
 *
 * One container, N independent buttons: the container only groups them (role
 * group + generic label, no hover answer, no selected state, no dividers). Every
 * button keeps its own hit area, tooltip, focus ring and Tab stop.
 */
export declare function createActionCluster(React: typeof ReactNamespace, deps: ActionClusterDeps): ReactNamespace.ComponentType<ActionClusterProps>;
