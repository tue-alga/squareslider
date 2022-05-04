import { Algorithm, World } from '../world';

import { GatherAlgorithm } from './gather';
import { CompactAlgorithm } from './compact';
import { CanonicalizeAlgorithm } from './canonicalize';

class GatherAndCompactAlgorithm {

	constructor(public world: World) { }

	*execute(): Algorithm {
		yield* new GatherAlgorithm(this.world).execute();
		yield* new CompactAlgorithm(this.world).execute();

		printStep("Execution finished");
	}
}

export { GatherAndCompactAlgorithm };
