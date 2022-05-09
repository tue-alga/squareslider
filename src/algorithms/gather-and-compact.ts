import { Algorithm, World } from '../world';

import { GatherAlgorithm } from './gather';
import { CompactAlgorithm } from './compact';
import { CanonicalizeAlgorithm } from './canonicalize';

class GatherAndCompactAlgorithm {

	constructor(public world: World) { }

	*execute(): Algorithm {
		yield* new GatherAlgorithm(this.world).execute();
		yield* new CompactAlgorithm(this.world).execute();
		if (!this.world.isXYMonotone()) {
			printStep("Root branch is not xy-monotone yet, rerunning");
			yield* new GatherAlgorithm(this.world).execute();
			yield* new CompactAlgorithm(this.world).execute();
			if (!this.world.isXYMonotone()) {
				throw new Error("No compacting move available while configuration " +
					"is not yet xy-monotone");
			}
		}

		printStep("Execution finished");
	}
}

export { GatherAndCompactAlgorithm };
