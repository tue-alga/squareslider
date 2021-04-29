import {Algorithm, World} from '../world';

class CustomAlgorithm {

	constructor(public world: World) {}

	*execute(): Algorithm {
		const moveJson = window.prompt('Input move sequence')!;
		const sequence: any = JSON.parse(moveJson);

		for (const a of sequence['movepaths']) {
			for (let i = 0; i < a.length - 1; i++) {
				const cube = this.world.getCube(this.convert(a[i]));
				if (!cube) {
					throw "Custom move path tried to move a non-existing cube at " + this.convert(a[i]);
				}
				const move = this.world.getMoveTo(cube, this.convert(a[i + 1]));
				if (!move) {
					throw "Custom move path tried to do an impossible move " + this.convert(a[i]) + " -> " + this.convert(a[i + 1]);
				}
				yield move;
			}
		}
	}

	private convert(c: [number, number]): [number, number] {
		return [c[1] - 1, 20 - c[0]];
	}
}

export {CustomAlgorithm};

