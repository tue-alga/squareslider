import {Algorithm, World} from '../world';

class GatherAlgorithm {

    constructor(public world: World) {}

	*execute(): Algorithm {

		/*printStep('Parity square removal');

		let parityCubes = this.findParityCubes();
		//console.log(parityCubes.map(c => c.p[0] + ',' + c.p[1]));
		for (let i = 0; i < parityCubes.length - 1; i += 2) {
			const c1 = parityCubes[i];
			const c2 = parityCubes[i + 1];
			printMiniStep(`Remove parity cube ` +
					`(${c1.p[0]}, ${c1.p[1]}) ` +
					`by merging it with another parity cube ` +
					`(${c2.p[0]}, ${c2.p[1]})`);
			yield* this.mergeParityCubes(parityCubes[i], parityCubes[i + 1]);
		}

		// TODO
		*/


		/*while (!this.isSiphonable()) {
			const gaps = this.gaps();
			console.log(gaps);

			const deflatables = gaps.filter(this.isDeflatable.bind(this));
			if (deflatables.length) {
				yield* this.doDeflate(deflatables[0]);
				continue;
			}
			const inflatables = gaps.filter(this.isInflatable.bind(this));
			if (inflatables.length) {
				yield* this.doInflate(inflatables[0]);
				continue;
			}

			printStep('No empty cells left, done!');
			break;
		}*/

		//while (this.isSiphonable()) {
		//while (this.hasCube([0, 1]) || this.hasCube([1, 0])) {
		//	yield* this.doSiphonStep();
		//}

		/*
		try {
			while (true) {
				yield* this.world.doAnyFreeMove();
			}
		} catch (e) {
			// continue;
		}*/

		//yield* this.buildBestBridge();  // TODO
		
		//yield* this.buildBridge(this.getCube(2, 7)!, this.getCube(1, 9)!);
	}
}

export {GatherAlgorithm};

