import {Algorithm, World} from '../world';

import {GatherAlgorithm} from './gather';
import {CompactAlgorithm} from './compact';

class CompleteAlgorithm {

	constructor(public world: World) {}

	*execute(): Algorithm {
		yield* new GatherAlgorithm(this.world).execute();
		yield* new CompactAlgorithm(this.world).execute();
	}
}

export {CompleteAlgorithm};

