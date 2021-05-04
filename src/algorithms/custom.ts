import {Algorithm, World} from '../world';

class CustomAlgorithm {

	constructor(public world: World) {}

	*execute(): Algorithm {
		const moveJson = window.prompt('Input move sequence')!;
		const sequence: any = JSON.parse(moveJson);
		const [ , , maxX, ] = this.world.bounds();

		for (let i = 0; i < sequence['movepaths'].length; i++) {
			const a = sequence['movepaths'][i];
			printMiniStep(`Running move path ${i}`);
			for (let i = 0; i < a.length - 1; i++) {
				const cube = this.world.getCube(this.convert(a[i], maxX));
				if (!cube) {
					throw "Custom move path tried to move a non-existing cube at " + this.convert(a[i], maxX);
				}
				yield* this.world.shortestMovePath(
					this.convert(a[i], maxX), this.convert(a[i + 1], maxX));
			}
		}
	}

	private convert(c: [number, number], maxX: number): [number, number] {
		return [c[1] - 1, maxX - c[0] + 1];
		//return c;
	}
}

export {CustomAlgorithm};

