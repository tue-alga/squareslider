import {Algorithm, World, Move, MoveDirection} from '../world';
import {Cube, ComponentStatus, Color} from '../cube';
import {Vector} from '../vector';

class CanonicalizeAlgorithm {

	constructor(public world: World) {}

	*execute(): Algorithm {
		printStep('Canonicalizing');

		try {
			while (true) {
				yield* this.doCanonicalizationMove();
			}
		} catch (e) {
			// do nothing
		}
	}

	*doCanonicalizationMove(): Algorithm {
		const [xMin, yMin] = this.highestMinPotentialEmptyCell();
		const [xMax, yMax] = this.lowestMaxPotentialCube();

		if (xMin + yMin > xMax + yMax ||
				(xMin + yMin === xMax + yMax && yMin < yMax)) {
			throw "no canonicalization move available";
		}

		yield* this.world.shortestMovePath([xMax, yMax], [xMin, yMin]);
	}

	lowestMaxPotentialCube(): [number, number] {
		let max = -Infinity;
		let [xMax, yMax] = [-1, -1];
		for (const c of this.world.cubes) {
			const potential = c.p[0] + c.p[1];
			if (potential > max ||
					(potential === max && c.p[1] < yMax)) {
				max = potential;
				[xMax, yMax] = [c.p[0], c.p[1]];
			}
		}
		return [xMax, yMax];
	}

	highestMinPotentialEmptyCell(): [number, number] {
		let min = Infinity;
		let [xMin, yMin] = [-1, -1];
		const check = function (x: number, y: number) {
			const potential = x + y;
			if (potential < min ||
					(potential === min && y > yMin)) {
				min = potential;
				[xMin, yMin] = [x, y];
			}
		}
		for (const c of this.world.cubes) {
			if (!this.world.hasCube([c.p[0], c.p[1] + 1])) {
				check(c.p[0], c.p[1] + 1);
			}
			if (!this.world.hasCube([c.p[0] + 1, c.p[1]])) {
				check(c.p[0] + 1, c.p[1]);
			}
		}

		return [xMin, yMin];
	}
}

export {CanonicalizeAlgorithm};

