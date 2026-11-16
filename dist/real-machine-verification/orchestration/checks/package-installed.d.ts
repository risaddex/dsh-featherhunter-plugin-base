/**
 * `package-installed` — the plugin under test is what the profile actually loads.
 *
 * The claim has four parts, and they are checked in the order that produces the
 * most useful failure:
 *
 * 1. the profile declares the package as a dependency;
 * 2. the installed manifest is readable (the package is really in `node_modules`);
 * 3. the installed version matches the checked-out repository when the working
 *    directory *is* that repository — and when it is not, the report says so
 *    instead of pretending the comparison happened (a green check on a skipped
 *    comparison is exactly the false green this capability exists to prevent);
 * 4. the declared `clientEntry` exists inside the installed package, and its
 *    sha256 is recorded so a later run can tell whether the bytes changed.
 */
import type { SelfCheckContext } from "../self-check";
import type { CheckModule } from "../types";
export declare function createPackageInstalledCheck(): CheckModule<SelfCheckContext>;
